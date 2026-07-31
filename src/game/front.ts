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
 * The sickness standing on the core, which it reaches only by winning the case there. Besieged is
 * not lost: every road being taken is what *starts* the last stand, and the gap between the two is
 * the one fight the whole run has been protecting.
 */
export function isRunLost(front: Front): boolean {
  return front.infected.includes('heart');
}

/**
 * Won when every case region — the ground a season is actually fought over — is held, and the
 * sickness is not standing on the core. The heart is not itself a case region, so holding the ten
 * without that second check would let a run be won and lost at the same instant: the body is not
 * saved while the thing it is built around is occupied, however much ground around it is held.
 */
export function isRunWon(front: Front): boolean {
  return !isRunLost(front) && CASE_REGIONS.every((node) => front.held.includes(node.id));
}

/**
 * The sickness's whole turn, and deliberately one step however many fronts it has: the day is
 * one-for-one with the player's, so a run is a race rather than a rout. It steps wherever it is
 * closest to the core, which makes it predictable — a player can see which fire is about to get
 * worse and plan against it, and that is the difference between pressure and harassment.
 */
export function stepSickness(
  front: Front, immunity: Readonly<Record<StrainId, number>>,
): Front {
  // The core is zero steps from the core, so sorting by distance alone would walk onto the heart
  // the moment one road fell — and the campaign this whole layer is built on would never happen.
  // It is off the table until every road is taken; `isCoreBesieged` is that rule, stated once.
  // That holds even for a heart the player has already fortified: a held heart is not besieged
  // early either, or the wall would start coming down the moment any one road opened.
  const coreOpen = !isCoreBesieged(front);

  const options = front.infected
    .flatMap((from) => neighboursOf(from).map((to) => ({ from, to })))
    .filter(({ to }) => !front.infected.includes(to))
    .filter(({ to }) => !(coreOpen && to === 'heart'))
    .sort((a, b) => stepsToCore(a.to) - stepsToCore(b.to) || a.to.localeCompare(b.to));

  const move = options[0];
  if (move === undefined) return front;

  if (!front.held.includes(move.to)) {
    return { ...front, infected: [...front.infected, move.to] };
  }

  // A wall. The step is spent on it either way — that is the whole point of holding ground.
  const left = front.siege[move.to] ?? wallDays(move.to, immunity);
  if (left > 0) {
    return { ...front, siege: { ...front.siege, [move.to]: left - 1 } };
  }

  const siege = { ...front.siege };
  Reflect.deleteProperty(siege, move.to);
  return {
    ...front,
    infected: [...front.infected, move.to],
    held: front.held.filter((node) => node !== move.to),
    siege,
  };
}

/**
 * A new outbreak, every `OUTBREAK_INTERVAL` days, at a door the sickness is not already in.
 *
 * The roll is the one place in this layer where luck decides anything, and it is the right place:
 * catching something is exactly what immunity is a chance against. What it may never do is undo
 * work the player did — a wall is days, not a roll — so a bad draw here costs a region the player
 * had not taken yet and never one they had.
 */
export function seedOutbreak(
  front: Front, immunity: Readonly<Record<StrainId, number>>,
): Front {
  if (front.day % OUTBREAK_INTERVAL !== 0) return front;

  const doors = ENTRY_REGIONS.filter((node) => !front.infected.includes(node.id));
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
export function endDay(front: Front, immunity: Readonly<Record<StrainId, number>>): Front {
  const stepped = stepSickness(front, immunity);
  const advanced = { ...stepped, day: stepped.day + 1 };
  return seedOutbreak(advanced, immunity);
}
