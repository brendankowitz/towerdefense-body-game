import {
  advanceToNextWave, matureDefender, maturationAt, placeDefender, startWave, towerAt,
} from '../../src/game/commands';
import { CASES } from '../../src/game/content/cases';
import { DEFENDERS, DEFENDER_ORDER } from '../../src/game/content/defenders';
import { maturedFormOf } from '../../src/game/content/maturation';
import { IMMUNITY_MAX, STEP_SECONDS } from '../../src/game/content/rules';
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
  /** True if a wave hit the step ceiling — a bug in the sweep or a stall in the simulation. */
  readonly stalled: boolean;
}

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
export function unlockedKinds(clearedCount: number): readonly DefenderKind[] {
  return DEFENDER_ORDER.filter((kind) => clearedCount >= DEFENDERS[kind].unlock);
}

/**
 * Every board of `kinds` over `spotCount` spots, in odometer order. `kinds.length ** spotCount`
 * of them: 5^5 = 3125 for a four-cell dock plus one, 6^5 = 7776 for the full dock.
 */
export function* everyBoard(
  kinds: readonly DefenderKind[],
  spotCount: number,
): Generator<readonly DefenderKind[]> {
  const board: DefenderKind[] = [];
  const first = kinds[0];
  if (first === undefined) return;
  for (let i = 0; i < spotCount; i += 1) board.push(first);

  const total = kinds.length ** spotCount;
  for (let n = 0; n < total; n += 1) {
    let rest = n;
    for (let spot = 0; spot < spotCount; spot += 1) {
      const kind = kinds[rest % kinds.length];
      if (kind !== undefined) board[spot] = kind;
      rest = Math.floor(rest / kinds.length);
    }
    yield [...board];
  }
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

export function playBoard(
  caseId: CaseId,
  clearedCount: number,
  board: readonly DefenderKind[],
  policy: MaturationPolicy,
  kinds: GrowableSet,
): BoardOutcome {
  const state = createSimState({
    caseId,
    immunity: immunityAfter(clearedCount),
    clearedCount,
    totalKills: 0,
  });

  let built = 0;
  let grown = 0;
  for (;;) {
    const spend = runBuildPhase(state, board, policy, kinds);
    built += spend.built;
    grown += spend.grown;
    startWave(state);

    let steps = 0;
    while (state.phase === 'wave') {
      step(state, STEP_SECONDS);
      steps += 1;
      if (steps > MAX_STEPS_PER_WAVE) {
        return {
          cleared: false,
          lastWave: state.waveIndex + 1,
          tissue: state.tissue,
          built,
          grown,
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
        stalled: false,
      };
    }

    advanceToNextWave(state);
  }
}
