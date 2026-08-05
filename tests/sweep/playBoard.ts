import {
  advanceToNextWave, matureDefender, maturationAt, placeDefender, startWave, towerAt,
} from '../../src/game/commands';
import { CASES, CASE_BY_ID } from '../../src/game/content/cases';
import { DEFENDERS, DEFENDER_ORDER } from '../../src/game/content/defenders';
import { maturedFormOf } from '../../src/game/content/maturation';
import { ARRIVALS_ENABLED, IMMUNITY_MAX, STEP_SECONDS } from '../../src/game/content/rules';
import { createSimState } from '../../src/game/state';
import { step } from '../../src/game/step';
import type { CaseId, DefenderKind, SimState, StrainId } from '../../src/game/types';

/**
 * Plays one board of one case through the real simulation, on the real fixed timestep, with the
 * real economy. Nothing here models the game: `step` is the shipped step, `placeDefender` and
 * `matureDefender` are the shipped commands, and the only thing this file contributes is what the
 * player would decide — a purchasing policy, a maturation policy, and a loop.
 *
 * A board is an assignment of a defender kind to each of the case's five build spots. It is an
 * *intent*, not a starting position — the economy decides how much of it the player ever gets to
 * build. See `buyCheapestFirst`.
 */

/** A wave that has not ended after this many steps is not going to end. 1000 simulated seconds. */
const MAX_STEPS_PER_WAVE = 60_000;

export interface BoardOutcome {
  /** The case was carried to the end of its last wave. */
  readonly cleared: boolean;
  /** 1-based wave the run ended on: the wave that cleared the case, or the wave that lost it. */
  readonly lastWave: number;
  /** Tissue pips left when the run ended. Zero on a loss. */
  readonly tissue: number;
  /** Cells the economy actually paid for over the whole run, of the five the board asked for. */
  readonly built: number;
  /** Cells the economy actually grew over the whole run. Always zero under `'never'`. */
  readonly grown: number;
  /**
   * Arrivals seen **standing on a mount at the end of a step**, and how many of those were
   * killers. Not the number of calls answered, and the difference is measured rather than
   * hand-waved — see below.
   *
   * Counted per step rather than read off `state.arrivals` at the end, because an arrival spends
   * itself and leaves: the list is empty again by the time a wave is over, so the end state says
   * nothing about how much help a run received. Zero under `'none'` by construction, and zero
   * under `'earned'` whenever `ARRIVALS_ENABLED` is off.
   *
   * **It undercounts, on purpose, because the exact count is not available from out here.**
   * `step` calls `callArrivals` and `stepArrivals` in the same pass, so an arrival that lands and
   * spends all `ARRIVAL_USES` before that step returns is gone by the time anything outside `step`
   * can look. Counting it exactly would mean intercepting the push — patching an array method on
   * `SimState` from a test harness — and a diagnostic column is not worth that. Measured against a
   * patched-push probe over 120 boards a case: relapse 685 seen of 917 answered, throat 422 of
   * 624, sinus 15 of 24, vesper 143 of 169. The bias is worse for killers, which need an
   * already-marked body and therefore spend out fastest where marks are thickest — throat saw 71
   * of 227. Read the column as "help that was still there on the next frame", which is what it is.
   *
   * Nothing chosen from this harness is measured off these two fields: every tuning number is a
   * clear rate. What they are for is the guard in `arrivals.sweep.ts` that a run which should have
   * been helped was, so a comparison can never report four identical arms agreeing beautifully
   * about nothing. An undercount is sound in that direction — a non-zero reading is proof help
   * arrived, whatever it missed.
   */
  readonly standing: number;
  readonly standingKillers: number;
  /** True if a wave hit the step ceiling — a bug in the sweep or a stall in the simulation. */
  readonly stalled: boolean;
}

/**
 * No memory of anything, which is what `ArrivalPolicy`'s `'none'` hands the simulation.
 *
 * Exported because it is also the only record in the sweeps that names all three strains and
 * nothing else, and `strainOf` (`arrivals.ts`) answers "is this pathogen a strain the immunity
 * screen tracks" by asking a record exactly that. `runSweep.ts` needs that question answered about
 * a wave table, and a second three-name table over there is the drift `strainOf` exists to prevent.
 */
export const NO_MEMORY: Readonly<Record<StrainId, number>> = { staph: 0, film: 0, virus: 0 };

/**
 * What the profile carries into this case, derived from the cases cleared before it rather than
 * assumed. Every case credits exactly one strain, so clearing the first two leaves two strains on
 * one and the rest on zero — nothing reaches `IMMUNITY_MAX`, so no vaccine is live in any sweep.
 * Stated rather than shortcut to zero, because that stops being true the moment a fourth case or
 * a replay lands.
 */
export function immunityAfter(clearedCount: number): Readonly<Record<StrainId, number>> {
  const immunity: Record<StrainId, number> = { staph: 0, film: 0, virus: 0 };
  for (const definition of CASES.slice(0, clearedCount)) {
    immunity[definition.credits] = Math.min(IMMUNITY_MAX, immunity[definition.credits] + 1);
  }
  return immunity;
}

/** The kinds the dock offers at this point in progression, in dock order. */
export function unlockedKinds(daysElapsed: number): readonly DefenderKind[] {
  return DEFENDER_ORDER.filter((kind) => daysElapsed >= DEFENDERS[kind].unlock);
}

/**
 * The board at one index of the odometer, spot 0 turning fastest. Exported because a sweep that
 * walks the whole space wants a generator and a sweep that samples it wants to name the board at
 * an index — and the two must decode an index the same way or they are enumerating two different
 * spaces under one name.
 */
export function boardAt(
  kinds: readonly DefenderKind[],
  spotCount: number,
  index: number,
): readonly DefenderKind[] {
  const board: DefenderKind[] = [];
  const first = kinds[0];
  if (first === undefined) return board;

  let rest = index;
  for (let spot = 0; spot < spotCount; spot += 1) {
    board.push(kinds[rest % kinds.length] ?? first);
    rest = Math.floor(rest / kinds.length);
  }
  return board;
}

/**
 * Every board of `kinds` over `spotCount` spots, in odometer order. `kinds.length ** spotCount`
 * of them: 5^5 = 3125 for a four-cell dock plus one, 6^5 = 7776 for the full dock.
 */
export function* everyBoard(
  kinds: readonly DefenderKind[],
  spotCount: number,
): Generator<readonly DefenderKind[]> {
  if (kinds[0] === undefined) return;
  const total = kinds.length ** spotCount;
  for (let n = 0; n < total; n += 1) yield boardAt(kinds, spotCount, n);
}

/**
 * The purchasing policy, and one of the two judgement calls in this harness.
 *
 * At every build phase the player fills as much of the board as the balance allows, cheapest
 * first: a real player buys what they can afford now rather than saving for a cell they cannot
 * name a wave for, and cheapest-first is the ordering that gets the most cells onto the board
 * soonest. Ties break on spot index, so the sweep is deterministic.
 *
 * What this deliberately does not model: reabsorbing a cell and calling fever. Both are real
 * decisions, both are optional, and a player who declines them plays exactly this policy — so a
 * clear rate measured here is a floor on what a thinking player can reach, which is the right
 * direction for a floor to be wrong in.
 *
 * Maturing used to be on that list, with the same "can only help" justification. It is now a
 * policy of its own (`MaturationPolicy`, crossed with `GrowableSet`) and it was measured, because
 * "optional" and "an improvement" are not the same claim — and one of the three forms was a rout.
 * The floor survives on the first claim alone: a player who declines all three plays exactly this
 * policy, so best play is at least this good whatever those decisions turn out to be worth.
 */
function buyCheapestFirst(state: SimState, board: readonly DefenderKind[]): number {
  const pending = board
    .map((kind, spotIndex) => ({ kind, spotIndex }))
    .filter(({ spotIndex }) => towerAt(state, spotIndex) === null)
    .sort((a, b) => DEFENDERS[a.kind].cost - DEFENDERS[b.kind].cost || a.spotIndex - b.spotIndex);

  let bought = 0;
  for (const { kind, spotIndex } of pending) {
    if (state.energy < DEFENDERS[kind].cost) continue;
    state.selected = kind;
    if (placeDefender(state, spotIndex)) bought += 1;
  }
  return bought;
}

/**
 * Whether the harness grows a placed cell, and what it is willing to give up to do it. The other
 * judgement call, and the reason there is more than one: growth is not free and a matured form is
 * a trade rather than an upgrade, so "the player could also mature" is a question with a
 * direction, not an aside.
 *
 * - `'never'` — what the sweep has always done, and what `balance.sweep.ts` still measures. Every
 *   number recorded in this repo comes from this policy.
 * - `'surplus'` — grow only once every spot the board asked for is filled, so growth spends energy
 *   placement had no use for. This is the strongest form of the "maturing can only help" claim:
 *   it never starves the board, so anything it loses, it loses on the stat trade alone.
 * - `'eager'` — grow whatever is affordable at the top of every build phase, before buying. The
 *   naive upgrade-lover, and the policy that tests whether growth competing with placement is a
 *   mistake.
 *
 * `maturation.sweep.ts` runs all three over the whole board space, crossed with `GrowableSet`, and
 * reports the difference. No number from it is repeated here: it moves every time a form is tuned,
 * and a docstring that quotes it goes stale silently. What holds whatever the numbers are is that
 * maturing is a trade and the trade is case-shaped, so no policy here is "the player playing well"
 * — which is why `'never'` is still what the gate measures.
 */
export type MaturationPolicy = 'never' | 'surplus' | 'eager';

/**
 * Which kinds a run is willing to grow, and the second axis of the comparison.
 *
 * A policy alone cannot answer whether growing a *particular* cell is worth it: `'surplus'` grows
 * everything it can afford, so a form that is a rout drags every board it appears on down with it
 * and a form that is a win is credited for boards the rout lost anyway. That is how an antibody
 * that could not hold a second of vessel from four of the season's fifteen spots hid inside an
 * aggregate for a whole tuning pass. Narrowing the set to one kind measures the form, which is
 * what the player is actually offered.
 *
 * Never optional. Every call states the set it means, because "all of them" and "the one I am
 * measuring" are the two readings of a missing argument and they answer different questions.
 */
export type GrowableSet = readonly DefenderKind[];

/** Every kind the content offers a form for, in dock order. */
export const EVERY_GROWABLE: GrowableSet = DEFENDER_ORDER.filter((kind) => maturedFormOf(kind) !== null);

/**
 * Grows what the balance allows, cheapest form first for the same reason placement buys cheapest
 * first: it is the ordering that gets the most cells grown soonest. Ties break on spot index, so
 * the sweep stays deterministic.
 */
export function growCheapestFirst(state: SimState, kinds: GrowableSet): number {
  const offers: { readonly spotIndex: number; readonly cost: number }[] = [];
  for (const tower of state.towers) {
    if (!kinds.includes(tower.kind)) continue;
    const form = maturationAt(state, tower.spotIndex);
    if (form !== null) offers.push({ spotIndex: tower.spotIndex, cost: form.cost });
  }
  offers.sort((a, b) => a.cost - b.cost || a.spotIndex - b.spotIndex);

  let grown = 0;
  for (const { spotIndex } of offers) {
    if (matureDefender(state, spotIndex)) grown += 1;
  }
  return grown;
}

/** Every spot the board asked for is standing. Cells are lost mid-wave, so this is asked afresh. */
function isBoardStanding(state: SimState, board: readonly DefenderKind[]): boolean {
  return board.every((_kind, spotIndex) => towerAt(state, spotIndex) !== null);
}

export interface BuildPhaseSpend {
  readonly built: number;
  readonly grown: number;
}

/**
 * One build phase: everything the policy does with the balance before the wave is started.
 * Exported so the policies can be exercised on a state whose energy is chosen rather than earned
 * — a test that had to play its way to a given balance would be asserting the economy.
 */
export function runBuildPhase(
  state: SimState,
  board: readonly DefenderKind[],
  policy: MaturationPolicy,
  kinds: GrowableSet,
): BuildPhaseSpend {
  const grownFirst = policy === 'eager' ? growCheapestFirst(state, kinds) : 0;
  const built = buyCheapestFirst(state, board);
  const grownAfter = policy === 'surplus' && isBoardStanding(state, board)
    ? growCheapestFirst(state, kinds)
    : 0;
  return { built, grown: grownFirst + grownAfter };
}

/**
 * Whether the profile's memory is on the board at all — the axis this file gave the feature before
 * the feature existed, and which Task 9 made mean something.
 *
 * - `'earned'` — the board plays the immunity it was handed. Every rate recorded in this repo was
 *   measured under this, whatever the argument was called at the time, because the immunity a
 *   caller passes has always been used as passed.
 * - `'none'` — the same board with **no memory of anything**: every strain zeroed before
 *   `createSimState` sees it. The difference between the two is what memory is worth.
 *
 * **`'none'` is "no memory", not "no arrivals", and that is a decision with a cost.**
 *
 * `ARRIVALS_ENABLED` is a module constant, so a harness that wanted arrivals off in one arm and on
 * in another inside a single process would have to reach into `src/game/` and teach it that a
 * sweep exists — which this repo does not do, and which would put a test axis inside the shipped
 * simulation forever to save one operator edit. Zeroing the immunity is the lever the harness
 * already has, and it is also the game's own rule: `noteRecognition` banks nothing for a strain at
 * zero, so "no memory, no response" is stated once, in `src/game/arrivals.ts`, and this policy
 * simply asks for it.
 *
 * **What it costs is the vaccine at full memory.** The three strain vaccines fire at
 * `IMMUNITY_MAX`, so at memory 3 the `'none'` arm has no vaccine either and the difference between
 * the arms is the response *and* the vaccine together. Below `IMMUNITY_MAX` nothing but
 * `noteRecognition` and `callArrivals` reads `state.immunity` at all — `applySpawn`'s tetanus
 * bounce, `resolveDeaths`' Flu B and `armourMultiplier`'s serum are every other reader and all
 * three are `>= IMMUNITY_MAX` — so at memory 1 and memory 2 the difference is the response and
 * nothing else. `arrivals.sweep.ts` decomposes the memory-3 column by running itself once with
 * `ARRIVALS_ENABLED` off, which measures the vaccine alone, and it *checks* the paragraph above
 * rather than trusting it: with the flag off, memory 1 and memory 2 must come out identical to the
 * baseline, board for board.
 *
 * Never optional, for the reason `GrowableSet` below is never optional: "the shipped game" and "no
 * memory at all" are the two readings of a missing argument here, and they are different games.
 */
export type ArrivalPolicy = 'none' | 'earned';

/**
 * Everything about a run that decides how a board plays, handed in rather than derived from a
 * count of cleared cases.
 *
 * `playBoard` derives all of this from one number, which is exactly right for a board sweep: it
 * walks the season in order, so the day, the immunity and the clears behind a case are the same
 * number. A run is the case where they come apart — a day is spent whether the case was won or
 * lost, ground is retaken and re-cleared, and the last stand is reached on whatever day the roads
 * happened to fall. `runSweep.ts` is that caller, and this is the shape it needs.
 */
export interface BoardContext {
  readonly caseId: CaseId;
  /** What the profile has earned, not what the season order implies. */
  readonly immunity: Readonly<Record<StrainId, number>>;
  /** 1-based, and the only thing that decides which cells the dock offers. */
  readonly day: number;
  /** MMR, earned. False everywhere the board sweep plays, since it enters no case with a profile. */
  readonly blocksAmnesia: boolean;
  /** See `ArrivalPolicy` above. Required, and for the reason stated there. */
  readonly arrivals: ArrivalPolicy;
}

/**
 * Which mounts have an arrival standing on them, as a bitmask.
 *
 * A landing is a discrete event nothing records — `Arrival` carries no age and should not, and an
 * arrival is rebuilt (`{ ...arrival, uses }`) every time it spends a use, so object identity says
 * nothing either. Occupancy is the field that does change, and `callArrivals` never puts two
 * arrivals on one mount, so a mount going empty-to-occupied is exactly one landing — the same
 * reading `ArrivalLayer` makes to time its entrance flourish.
 *
 * A bitmask and no allocation, because this runs on every step of every board of every arm: the
 * balance sweep alone is a few hundred million steps, and a `Set` or a `find` here would be
 * measurable against the simulation it is watching.
 */
function occupancyOf(state: SimState): number {
  let mask = 0;
  for (const arrival of state.arrivals) mask |= 1 << arrival.mountIndex;
  return mask;
}

export function playBoardIn(
  context: BoardContext,
  board: readonly DefenderKind[],
  policy: MaturationPolicy,
  kinds: GrowableSet,
): BoardOutcome {
  const state = createSimState({
    caseId: context.caseId,
    immunity: context.arrivals === 'earned' ? context.immunity : NO_MEMORY,
    day: context.day,
    totalKills: 0,
    blocksAmnesia: context.blocksAmnesia,
  });

  // Nothing can land under `'none'` — every strain is at zero, so `noteRecognition` banks nothing
  // — and nothing can land with the feature off, so neither pays for the watch.
  const watching = ARRIVALS_ENABLED
    && context.arrivals === 'earned'
    && CASE_BY_ID[context.caseId].mounts.length > 0;

  let built = 0;
  let grown = 0;
  let standing = 0;
  let standingKillers = 0;
  let occupied = 0;
  for (;;) {
    const spend = runBuildPhase(state, board, policy, kinds);
    built += spend.built;
    grown += spend.grown;
    startWave(state);

    let steps = 0;
    while (state.phase === 'wave') {
      step(state, STEP_SECONDS);
      if (watching) {
        const now = occupancyOf(state);
        const fresh = now & ~occupied;
        if (fresh !== 0) {
          for (const arrival of state.arrivals) {
            if ((fresh & (1 << arrival.mountIndex)) === 0) continue;
            standing += 1;
            if (arrival.kind === 'killer') standingKillers += 1;
          }
        }
        occupied = now;
      }
      steps += 1;
      if (steps > MAX_STEPS_PER_WAVE) {
        return {
          cleared: false,
          lastWave: state.waveIndex + 1,
          tissue: state.tissue,
          built,
          grown,
          standing,
          standingKillers,
          stalled: true,
        };
      }
    }

    if (state.result !== 'wave') {
      return {
        cleared: state.result === 'case',
        lastWave: state.waveIndex + 1,
        tissue: state.tissue,
        built,
        grown,
        standing,
        standingKillers,
        stalled: false,
      };
    }

    advanceToNextWave(state);
  }
}

/**
 * The season-order board play, and the one every recorded clear rate in this repo was measured
 * under: the case at index `daysElapsed`, met on the day a clean run would meet it, with the
 * immunity a clean run would have earned by then and no vaccine blocking anything.
 *
 * Named for the days because that is what the dock's unlock schedule reads now — it opens cells on
 * the days a body has survived, not the cases it has won. A clean season walk meets the case at
 * index n on day n+1 having cleared n cases, so the one number is all three at once; the immunity
 * below is the only place it is still genuinely a count of clears.
 *
 * A thin wrapper rather than the other way round, so nothing about the board sweep changed when
 * the run sweep needed a context of its own.
 *
 * `arrivals` had a default of `'none'` while nothing read it. It has none now: the day `'none'`
 * started meaning "no memory of anything" is the day a defaulted argument would have silently
 * taken the vaccines off every late case in the season, and a caller that leaves it off should not
 * compile rather than quietly measure a different game.
 */
export function playBoard(
  caseId: CaseId,
  daysElapsed: number,
  board: readonly DefenderKind[],
  policy: MaturationPolicy,
  kinds: GrowableSet,
  arrivals: ArrivalPolicy,
): BoardOutcome {
  return playBoardIn({
    caseId,
    immunity: immunityAfter(daysElapsed),
    // Day and case index track each other one for one — day 1 is zero days elapsed, the case at
    // index 0 — so this reproduces the schedule `unlockedKinds` above already measures by index.
    day: daysElapsed + 1,
    blocksAmnesia: false,
    arrivals,
  }, board, policy, kinds);
}
