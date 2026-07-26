import { placeDefender, startWave, towerAt, advanceToNextWave } from '../../src/game/commands';
import { CASES } from '../../src/game/content/cases';
import { DEFENDERS, DEFENDER_ORDER } from '../../src/game/content/defenders';
import { IMMUNITY_MAX, STEP_SECONDS } from '../../src/game/content/rules';
import { createSimState } from '../../src/game/state';
import { step } from '../../src/game/step';
import type { CaseId, DefenderKind, SimState, StrainId } from '../../src/game/types';

/**
 * Plays one board of one case through the real simulation, on the real fixed timestep, with the
 * real economy. Nothing here models the game: `step` is the shipped step, `placeDefender` is the
 * shipped command, and the only thing this file contributes is a purchasing policy and a loop.
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
 * The purchasing policy, and the one judgement call in this harness.
 *
 * At every build phase the player fills as much of the board as the balance allows, cheapest
 * first: a real player buys what they can afford now rather than saving for a cell they cannot
 * name a wave for, and cheapest-first is the ordering that gets the most cells onto the board
 * soonest. Ties break on spot index, so the sweep is deterministic.
 *
 * What this deliberately does not model: maturing a placed cell, reabsorbing one, and calling
 * fever. All three are real decisions and all three can only help, so a clear rate measured here
 * is a floor on what a thinking player can reach — which is the right direction for a floor to
 * be wrong in.
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

export function playBoard(
  caseId: CaseId,
  clearedCount: number,
  board: readonly DefenderKind[],
): BoardOutcome {
  const state = createSimState({
    caseId,
    immunity: immunityAfter(clearedCount),
    clearedCount,
    totalKills: 0,
  });

  let built = 0;
  for (;;) {
    built += buyCheapestFirst(state, board);
    startWave(state);

    let steps = 0;
    while (state.phase === 'wave') {
      step(state, STEP_SECONDS);
      steps += 1;
      if (steps > MAX_STEPS_PER_WAVE) {
        return {
          cleared: false, lastWave: state.waveIndex + 1, tissue: state.tissue, built, stalled: true,
        };
      }
    }

    if (state.result !== 'wave') {
      return {
        cleared: state.result === 'case',
        lastWave: state.waveIndex + 1,
        tissue: state.tissue,
        built,
        stalled: false,
      };
    }

    advanceToNextWave(state);
  }
}
