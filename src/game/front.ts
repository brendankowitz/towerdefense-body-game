import { CASE_BY_ID, CASES } from './content/cases';
import { CASE_REGIONS, ENTRY_REGIONS } from './content/body';
import { DOOR_RESIST_PER_CLEAR, IMMUNITY_MAX, OUTBREAK_INTERVAL, SIEGE_BASE_DAYS } from './content/rules';
import { CORE_ROADS, neighboursOf, stepsToCore } from './graph';
import { createRng } from './rng';
import type { BodyNodeId, CaseId, StrainId } from './types';

/**
 * The layer above the fight: which ground the sickness holds, which ground the player does, and
 * what it costs to change either.
 *
 * Pure and total, in the same shape as `progression.ts` — the simulation never reads it, the
 * screens never write it, and every roll runs off `rngState` and writes it back so a whole run
 * replays from its seed. That is what makes `runSweep.ts` able to measure a season at all.
 */
export type RegionState = 'cold' | 'hot' | 'held' | 'besieged';

export interface Front {
  /** Nodes the sickness holds, joints included. */
  readonly infected: readonly BodyNodeId[];
  /** Regions cleared and still standing. */
  readonly held: readonly BodyNodeId[];
  /** Days of wall left on a held region currently under attack. Absent means not under attack. */
  readonly siege: Readonly<Partial<Record<BodyNodeId, number>>>;
  readonly day: number;
  readonly rngState: number;
  /**
   * The one loss this layer remembers, and the only fact here that is set once and never
   * unset: the heart case was fought and lost. Nothing else about a case is memory — every
   * other loss just leaves the region `infected` for another day, the way it always has.
   *
   * Its absence is what makes `infected.includes('heart')` and this different questions.
   * `stepSickness` walks onto the core the instant the last road falls, the same as it would
   * walk onto any other open ground, so a heart in `infected` only means the sickness is
   * *besieging* the core — which is the last stand starting, not the run ending. Losing that
   * fight is a separate event this field is the only record of, and it is why `isRunLost` reads
   * this rather than `infected`.
   */
  readonly lost: boolean;
}

/** The node a case is fought over, by case. Built once; the mapping never changes during a run. */
const NODE_OF: ReadonlyMap<CaseId, BodyNodeId> = new Map(CASES.map((c) => [c.id, c.node]));

const CASE_AT: ReadonlyMap<BodyNodeId, CaseId> = new Map(CASES.map((c) => [c.node, c.id]));

export function caseAt(node: BodyNodeId): CaseId | null {
  return CASE_AT.get(node) ?? null;
}

export function nodeOf(caseId: CaseId): BodyNodeId {
  return NODE_OF.get(caseId) ?? CASE_BY_ID[caseId].node;
}

/**
 * The one case fought on the core rather than over a region to hold. Asked through here rather
 * than by comparing a node to `'heart'` at each call site, because every layer that has to know
 * — what a win does to the front, what `cleared` counts, which copy the result sheet shows — is
 * asking the same question and none of them should be able to answer it differently.
 */
export function isLastStand(caseId: CaseId): boolean {
  return nodeOf(caseId) === 'heart';
}

/**
 * A fresh body, with one outbreak already at a door — the run opens on something happening to you
 * rather than on an empty map with nothing to do.
 */
export function createFront(seed: number): Front {
  const rng = createRng(seed);
  const index = Math.floor(rng.next() * ENTRY_REGIONS.length);
  const door = ENTRY_REGIONS[index] ?? ENTRY_REGIONS[0];
  if (door === undefined) throw new Error('the body has no doors for illness to come in at');

  return {
    infected: [door.id],
    held: [],
    siege: {},
    day: 1,
    rngState: rng.state,
    lost: false,
  };
}

export function stateOf(front: Front, node: BodyNodeId): RegionState {
  if (front.infected.includes(node)) return 'hot';
  if (!front.held.includes(node)) return 'cold';
  return front.siege[node] === undefined ? 'held' : 'besieged';
}

/** Every case the player could fight today, in season order so the list is stable to read. */
export function hotCases(front: Front): readonly CaseId[] {
  return CASES.filter((c) => front.infected.includes(c.node)).map((c) => c.id);
}

/** Days a region holds out for: what it was cleared on top of, plus the base every wall has. */
export function wallDays(
  node: BodyNodeId, immunity: Readonly<Record<StrainId, number>>,
): number {
  const caseId = caseAt(node);
  const strain = caseId === null ? null : CASE_BY_ID[caseId].credits;
  return SIEGE_BASE_DAYS + (strain === null ? 0 : immunity[strain]);
}

/**
 * A held region's status in words: holding, or counting down. One copy, because the map and the
 * season screen both name a wall's countdown and a sentence typed twice in two layers is a
 * sentence that can say two different things about the same wall — which it already had, once
 * this was two copies with two capitalisations of the same words.
 */
export function wallStatus(front: Front, node: BodyNodeId): string {
  const left = front.siege[node];
  return left === undefined ? 'Holding' : `${String(left)} day${left === 1 ? '' : 's'} left`;
}

/** A case cleared: the sickness is off that ground and the player is on it. */
export function holdRegion(front: Front, node: BodyNodeId): Front {
  const siege = { ...front.siege };
  Reflect.deleteProperty(siege, node);
  return {
    ...front,
    infected: front.infected.filter((id) => id !== node),
    held: front.held.includes(node) ? front.held : [...front.held, node],
    siege,
  };
}

/**
 * The last stand won: the body takes the core, and the sickness is driven off every road to it.
 *
 * Winning clears more than the one node on purpose, and the reason is `stepsToCore('heart') === 0`.
 * A sickness left standing on the roads is adjacent to the core every day after, and the core is
 * always the closest thing to the core — so it would spend its whole turn on that one wall, take
 * no other ground at all, break through, and hand the player the same fight again. The hardest
 * case in the game would pay its clear reward on a loop while the front line stood still. Pushing
 * it back off the roads means it has to take all of them again before it can so much as reach the
 * heart, which is what makes a won last stand a reprieve rather than a revolving door.
 *
 * The roads come back cold, not held: the body drove the sickness off that ground, it did not win
 * the cases fought over it. Holding them still costs the days it always did.
 */
export function holdCore(front: Front): Front {
  const rallied = holdRegion(front, 'heart');
  return { ...rallied, infected: rallied.infected.filter((node) => !CORE_ROADS.includes(node)) };
}

/**
 * The bank's only sink, and the only thing that competes with fighting for a day. Reinforcing
 * ground rather than buying a cell keeps the season screen's rule intact — what immunity does is
 * still earned, and what this buys is time.
 *
 * No cap on how many days a wall can be shored up to. It does not need one: every call here is a
 * day the player did not spend fighting, and the sickness still takes its step that day regardless
 * of which region is under siege — so a run spent shoring up one wall forever is a run spent
 * losing every other region to it. The bank itself only grows by clearing cases, which costs days
 * the same way. A cap here would be a second limit on something the day itself already limits.
 */
export function shoreUp(
  front: Front, node: BodyNodeId, immunity: Readonly<Record<StrainId, number>>,
): Front {
  if (!front.held.includes(node)) return front;
  const left = front.siege[node] ?? wallDays(node, immunity);
  return { ...front, siege: { ...front.siege, [node]: left + 1 } };
}

/** True once every road to the core is in enemy hands — the one condition that opens the heart. */
export function isCoreBesieged(front: Front): boolean {
  return CORE_ROADS.every((node) => front.infected.includes(node));
}

/**
 * Three different facts, and the whole shape of the ending is that they do not collapse into one
 * another:
 *
 * - **Besieged** (`isCoreBesieged`) — every road to the core is in enemy hands. The core itself is
 *   still untouched.
 * - **Reached** (`front.infected.includes('heart')`) — the sickness has taken the one step left
 *   once besieged, the same ordinary conquest `stepSickness` gives any open ground. This is what
 *   *starts* the last stand: `hotCases` now offers the heart case, because there is a fight to
 *   have. A run in this state is not lost — it is the one moment the whole game has been building
 *   toward, and ending it here would mean the fight this layer exists to protect never happens.
 * - **Lost** (`front.lost`) — the last stand was fought and lost. This is the only one of the
 *   three that ends the run, and the only one of the three this module remembers as a fact rather
 *   than derives from `infected` — every other case's loss is not memory at all, it just leaves
 *   the region hot for another day.
 */
export function isRunLost(front: Front): boolean {
  return front.lost;
}

/**
 * The heart case lost: the run's only bad ending, and the one loss `Front` keeps a record of.
 * Every other case can be lost and tried again the next day for free — the region simply stays
 * `infected` and nothing here changes — but the last stand has no next day, so this is the fact
 * that has to outlive the fight that produced it. `infected` and `held` are left exactly as they
 * were: the sickness is still standing on the core, which is the truth, and `lost` is the only
 * new thing this records.
 */
export function loseCore(front: Front): Front {
  return { ...front, lost: true };
}

/**
 * How much of the season's ground the body holds *right now* — the map's numerator, the Immunity
 * screen's "REGIONS HELD", and the count `isRunWon` asks after, all off one function so no screen
 * can disagree with the ending.
 *
 * Counted against `CASE_REGIONS` rather than off `held.length` for two reasons, and both of them
 * are reachable. A won last stand puts the core in `held` too (`holdCore`), and the core is
 * defended rather than held, so counted raw it would read as an eleventh region out of ten. And
 * `cleared.length`, which the screens used to count instead, never falls — it is a record of what
 * a run has done, not of what it still has, so the moment the sickness retook a region the two
 * screens and the ending disagreed about the same body.
 */
export function heldRegionCount(front: Front): number {
  return CASE_REGIONS.filter((node) => front.held.includes(node.id)).length;
}

/**
 * Won when every case region — the ground a season is actually fought over — is held, the run is
 * not lost, and the core is not currently under an unresolved last stand. The heart is not itself
 * a case region, so holding the ten alone is not enough: without the second check a run could be
 * won and lost at the same instant, and without the third a run could be declared won while the
 * sickness is still standing on the core, mid-fight, simply because the last stand had not yet
 * been decided either way. In practice a besieged core needs every road — several of them case
 * regions — in enemy hands, which already rules out holding all ten; the check stays because nothing
 * here should depend on that being true of the graph rather than being true by construction.
 */
export function isRunWon(front: Front): boolean {
  return !isRunLost(front) && !front.infected.includes('heart')
    && heldRegionCount(front) === CASE_REGIONS.length;
}

/**
 * A fact about the day's rules, handed in rather than looked up — `front.ts` is the pure siege
 * layer and has no way to know a vaccine, a gate or a profile exists. Whoever calls `stepSickness`
 * or `endDay` is the one who knows whether either is true, and decides by passing this in.
 */
export interface FrontRules {
  /** Chickenpox: held ground cannot be besieged at all. Earned, so it arrives late or never. */
  readonly wallsCannotFall: boolean;
}

const ORDINARY_RULES: FrontRules = { wallsCannotFall: false };

/**
 * Every entry in `siege` is, by construction, a region the player holds — nothing else in this
 * module ever writes one — so once `wallsCannotFall` is true there is nothing left for a
 * countdown already in progress to count down to. Lifting it here rather than leaving it to expire
 * on its own matters because it never will: `wallsCannotFall` also drops the region from every
 * future move below, so an untouched countdown would sit on the map forever, at whatever number it
 * stopped at, telling the player a wall that cannot fall is still under attack.
 */
function withSiegesLifted(front: Front): Front {
  return { ...front, siege: {} };
}

/**
 * The sickness's whole turn, and deliberately one step however many fronts it has: the day is
 * one-for-one with the player's, so a run is a race rather than a rout. It steps wherever it is
 * closest to the core, which makes it predictable — a player can see which fire is about to get
 * worse and plan against it, and that is the difference between pressure and harassment.
 */
export function stepSickness(
  front: Front, immunity: Readonly<Record<StrainId, number>>, rules: FrontRules = ORDINARY_RULES,
): Front {
  const standing = rules.wallsCannotFall ? withSiegesLifted(front) : front;

  // The core is zero steps from the core, so sorting by distance alone would walk onto the heart
  // the moment one road fell — and the campaign this whole layer is built on would never happen.
  // It is off the table until every road is taken; `isCoreBesieged` is that rule, stated once.
  // That holds even for a heart the player has already fortified: a held heart is not besieged
  // early either, or the wall would start coming down the moment any one road opened.
  const coreOpen = !isCoreBesieged(standing);

  const options = standing.infected
    .flatMap((from) => neighboursOf(from).map((to) => ({ from, to })))
    .filter(({ to }) => !standing.infected.includes(to))
    .filter(({ to }) => !(coreOpen && to === 'heart'))
    // Chickenpox: dropped from the candidates entirely rather than stopped once chosen, so held
    // ground never even starts a siege — the vaccine's promise is that it cannot fall, not that
    // it falls slower.
    .filter(({ to }) => !(rules.wallsCannotFall && standing.held.includes(to)))
    // The tiebreak is a byte compare rather than `localeCompare`: this module's whole contract is
    // that a run replays identically from its seed, and `localeCompare` resolves through ICU, so
    // its answer depends on the host's default locale and on which ICU data the runtime was built
    // with. Every measured constant in `rules.ts` sits on top of this ordering. Verified identical
    // to `localeCompare` on all 225 pairs of `BodyNodeId` under the host locale, so nothing that
    // was measured moves.
    .sort((a, b) => stepsToCore(a.to) - stepsToCore(b.to) || (a.to < b.to ? -1 : a.to > b.to ? 1 : 0));

  const move = options[0];
  if (move === undefined) return standing;

  if (!standing.held.includes(move.to)) {
    return { ...standing, infected: [...standing.infected, move.to] };
  }

  // A wall. The step is spent on it either way — that is the whole point of holding ground.
  const left = standing.siege[move.to] ?? wallDays(move.to, immunity);
  if (left > 0) {
    return { ...standing, siege: { ...standing.siege, [move.to]: left - 1 } };
  }

  const siege = { ...standing.siege };
  Reflect.deleteProperty(siege, move.to);
  return {
    ...standing,
    infected: [...standing.infected, move.to],
    held: standing.held.filter((node) => node !== move.to),
    siege,
  };
}

/**
 * A new outbreak, every `OUTBREAK_INTERVAL` days, at a door the sickness is not already in and
 * the player is not standing on.
 *
 * The roll is the one place in this layer where luck decides anything, and it is the right place:
 * catching something is exactly what immunity is a chance against. What it may never do is undo
 * work the player did — a wall is days, not a roll — so a bad draw here costs a region the player
 * had not taken yet and never one they had.
 *
 * **Held doors are defended, not overwritten.** A door the player cleared is a door with earned
 * immunity and a standing wall behind it, and that is exactly what stops a new infection taking
 * hold there — so it is dropped from the candidates rather than rolled against. Anything else
 * would put the same node in `infected` and `held` at once, which is a state the rest of this
 * module has no reading of: `stateOf` would call the ground `hot` while the map lists its wall,
 * `stepSickness` never opens a siege against ground already infected so nothing would ever take
 * it back out of `held`, and `isRunWon` would count it toward a win with the sickness on it.
 *
 * Chickenpox needs no separate thread through here for the same reason. `wallsCannotFall` is the
 * promise that cleared ground does not reopen; held ground is off this roll for every body, with
 * or without the vaccine, so the promise holds at the door as well as at the wall.
 */
export function seedOutbreak(
  front: Front, immunity: Readonly<Record<StrainId, number>>,
): Front {
  if (front.day % OUTBREAK_INTERVAL !== 0) return front;

  const doors = ENTRY_REGIONS.filter(
    (node) => !front.infected.includes(node.id) && !front.held.includes(node.id),
  );
  if (doors.length === 0) return front;

  const rng = createRng(front.rngState);
  const door = doors[Math.floor(rng.next() * doors.length)];
  const shrugged = rng.next();
  const rngState = rng.state;
  if (door === undefined) return { ...front, rngState };

  const caseId = caseAt(door.id);
  const strain = caseId === null ? null : CASE_BY_ID[caseId].credits;
  const resistance = strain === null
    ? 0
    : Math.min(1, immunity[strain] * DOOR_RESIST_PER_CLEAR);

  if (shrugged < resistance) return { ...front, rngState };
  return { ...front, infected: [...front.infected, door.id], rngState };
}

/** Named so the roll and the copy that explains it read the same number. */
export const MAX_DOOR_RESISTANCE = Math.min(1, IMMUNITY_MAX * DOOR_RESIST_PER_CLEAR);

/** The sickness's whole day: it takes its step, then something new may get in. */
export function endDay(
  front: Front, immunity: Readonly<Record<StrainId, number>>, rules: FrontRules = ORDINARY_RULES,
): Front {
  const stepped = stepSickness(front, immunity, rules);
  const advanced = { ...stepped, day: stepped.day + 1 };
  return seedOutbreak(advanced, immunity);
}
