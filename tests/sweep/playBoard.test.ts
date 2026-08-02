import { describe, expect, it } from 'vitest';
import { maturationAt, placeDefender, reabsorbDefender, towerAt } from '../../src/game/commands';
import { CASES } from '../../src/game/content/cases';
import { DEFENDERS, DEFENDER_ORDER } from '../../src/game/content/defenders';
import { maturedFormOf } from '../../src/game/content/maturation';
import { createSimState } from '../../src/game/state';
import type { DefenderKind, SimState } from '../../src/game/types';
import {
  EVERY_GROWABLE, growCheapestFirst, immunityAfter, playBoard, runBuildPhase,
  type GrowableSet, type MaturationPolicy,
} from './playBoard';

/**
 * The harness's own tests. The sweeps assert balance and take minutes; these assert what the
 * purchasing and maturation policies do with a balance, and run in milliseconds.
 *
 * Energy is set rather than earned. A test that had to play its way to a given balance would be
 * asserting the economy on the way past, and would break on any tuning that moved income — so
 * every case below states the balance it is about and derives it from the costs in `content/`.
 */

const CASE_ID = 'forearm';
const SPOTS = 5;

/**
 * A profile with the whole season behind it, so every cell and both matured forms are open.
 *
 * These tests are about what the policies do with a balance, not about what the season has handed
 * over yet — a fixture short of a form's unlock would test the gate in `maturationOffer` over and
 * over instead, and read as the policy declining to grow.
 */
const CLEARED = CASES.length;

/**
 * A case whose own strain the season takes all the way to `IMMUNITY_MAX`, so a profile that has
 * cleared the season plays it behind a vaccine and a profile with nothing behind it does not.
 * Throat credits virus and so do measles and bronchitis, which is three clears and the Flu B
 * shield — the largest single thing memory does to a board that is not an arrival.
 */
const VACCINATED_CASE = 'throat';

function openState(): SimState {
  return createSimState({
    caseId: CASE_ID, immunity: immunityAfter(0), day: CLEARED + 1, totalKills: 0,
  });
}

function boardOf(kind: DefenderKind): readonly DefenderKind[] {
  return Array.from({ length: SPOTS }, () => kind);
}

function growthCost(kind: DefenderKind): number {
  const form = maturedFormOf(kind);
  if (form === null) throw new Error(`${kind} has no matured form to price`);
  return form.cost;
}

/** Places without charging for it: these tests are about what happens to the balance afterwards. */
function place(state: SimState, kind: DefenderKind, spotIndex: number): void {
  state.selected = kind;
  state.energy += DEFENDERS[kind].cost;
  if (!placeDefender(state, spotIndex)) throw new Error(`could not place ${kind} on ${String(spotIndex)}`);
}

function isMatured(state: SimState, spotIndex: number): boolean {
  return towerAt(state, spotIndex)?.matured ?? false;
}

describe('growCheapestFirst', () => {
  it('grows the cheaper form when the balance only reaches one of the two', () => {
    expect(
      growthCost('phago'),
      'this case needs one form to be cheaper than the other to have anything to order',
    ).toBeLessThan(growthCost('anti'));

    const state = openState();
    place(state, 'phago', 0);
    place(state, 'anti', 1);
    state.energy = growthCost('anti');

    expect(growCheapestFirst(state, EVERY_GROWABLE)).toBe(1);
    expect(isMatured(state, 0)).toBe(true);
    expect(isMatured(state, 1)).toBe(false);
  });

  it('breaks a tie between two of the same form on spot index, not on placement order', () => {
    const state = openState();
    place(state, 'phago', 3);
    place(state, 'phago', 1);
    state.energy = growthCost('phago');

    expect(growCheapestFirst(state, EVERY_GROWABLE)).toBe(1);
    expect(isMatured(state, 1)).toBe(true);
    expect(isMatured(state, 3)).toBe(false);
  });

  /**
   * The per-kind axis of `maturation.sweep.ts`, which is the whole reason the set is a parameter.
   * Both cells here are affordable and both have a form, so a run that ignored the set would grow
   * two — the assertion is that it grew the named one and left the other standing as it was.
   */
  it('grows only the kinds it was given, however affordable the rest are', () => {
    const state = openState();
    place(state, 'phago', 0);
    place(state, 'anti', 1);
    state.energy = growthCost('phago') + growthCost('anti');

    expect(growCheapestFirst(state, ['anti'])).toBe(1);
    expect(isMatured(state, 1)).toBe(true);
    expect(isMatured(state, 0)).toBe(false);
  });

  it('grows nothing at all when the set is empty', () => {
    const state = openState();
    place(state, 'phago', 0);
    state.energy = growthCost('phago');

    expect(growCheapestFirst(state, [])).toBe(0);
    expect(isMatured(state, 0)).toBe(false);
  });
});

describe('runBuildPhase', () => {
  function phaseOn(
    policy: MaturationPolicy,
    energy: number,
    placed: number,
    board: readonly DefenderKind[] = boardOf('phago'),
    kinds: GrowableSet = EVERY_GROWABLE,
  ): { readonly built: number; readonly grown: number } {
    const state = openState();
    for (let spotIndex = 0; spotIndex < placed; spotIndex += 1) place(state, 'phago', spotIndex);
    state.energy = energy;
    return runBuildPhase(state, board, policy, kinds);
  }

  it('leaves a growth the board has no other use for unspent under never', () => {
    // Exactly the board, plus one cell's growth. The two policies differ in nothing else.
    const energy = DEFENDERS.phago.cost * SPOTS + growthCost('phago');

    expect(phaseOn('never', energy, 0)).toEqual({ built: SPOTS, grown: 0 });
    expect(phaseOn('surplus', energy, 0)).toEqual({ built: SPOTS, grown: 1 });
  });

  it('grows before buying under eager, so a growth costs the board a cell', () => {
    // Two cells standing, three spots open, and exactly one cell's growth in the bank. Eager
    // reaches for the growth and has nothing left to place with; surplus places.
    const energy = growthCost('phago');

    expect(phaseOn('eager', energy, 2)).toEqual({ built: 0, grown: 1 });
    expect(phaseOn('surplus', energy, 2)).toEqual({ built: 1, grown: 0 });
  });

  it('will not grow under surplus while a spot the board asked for is empty', () => {
    // The board asks for two cells the balance cannot reach, so it never stands — and what is
    // left after buying what it can is still enough to grow with. A board of one kind could not
    // show this: buying cheapest-first would leave less behind than a cell costs, and a growth
    // costs more than that, so the gate would never be the thing that stopped it.
    const board: readonly DefenderKind[] = ['phago', 'phago', 'phago', 'mast', 'mast'];
    const energy = DEFENDERS.phago.cost + growthCost('phago');
    expect(
      growthCost('phago'),
      'the leftover has to be short of the cells the board is still missing, or the board stands',
    ).toBeLessThan(DEFENDERS.mast.cost);

    expect(phaseOn('surplus', energy, 2, board)).toEqual({ built: 1, grown: 0 });
    expect(phaseOn('eager', energy, 2, board)).toEqual({ built: 1, grown: 1 });
  });

  /**
   * The kind filter has to survive the build phase, not just `growCheapestFirst` on its own. Each
   * timing is run twice on the same balance and the same board, so the only difference between the
   * two readings is the set — the energy left over goes back to placement, which is exactly what a
   * per-kind row of the comparison is measuring against.
   */
  it('honours the growable set under every timing that grows at all', () => {
    const energy = growthCost('phago');
    const board = boardOf('phago');

    expect(phaseOn('eager', energy, 2, board, EVERY_GROWABLE).grown).toBe(1);
    expect(phaseOn('eager', energy, 2, board, []).grown).toBe(0);
    expect(phaseOn('surplus', energy, SPOTS, board, EVERY_GROWABLE).grown).toBe(1);
    expect(phaseOn('surplus', energy, SPOTS, board, []).grown).toBe(0);
  });
});

describe('playBoard', () => {
  /**
   * The last case of the season, played with the season behind it — so every cell is in the dock
   * and both matured forms are open. A run on day 1 would measure the unlock schedule
   * rather than the policy, and would read as the policy declining to grow.
   */
  const LATE_CASE = CASES[CASES.length - 1]?.id ?? CASE_ID;
  const LATE_CLEARS = CASES.length - 1;

  it('carries the policy through a whole run', () => {
    const board = boardOf('phago');

    const never = playBoard(LATE_CASE, LATE_CLEARS, board, 'never', EVERY_GROWABLE, 'earned');
    const surplus = playBoard(LATE_CASE, LATE_CLEARS, board, 'surplus', EVERY_GROWABLE, 'earned');

    expect(never.grown).toBe(0);
    // Surplus only ever grows on a standing board, so this also says the board was built.
    expect(surplus.grown).toBeGreaterThan(0);
  });

  /**
   * The per-kind axis over a whole run. A board of one kind grows under a set that names it and
   * stands unchanged under a set that names the other — which is what makes each row of the
   * comparison a measurement of one form rather than of all three at once.
   */
  it('carries the growable set through a whole run', () => {
    const board = boardOf('phago');

    expect(playBoard(LATE_CASE, LATE_CLEARS, board, 'surplus', ['phago'], 'earned').grown)
      .toBeGreaterThan(0);
    expect(playBoard(LATE_CASE, LATE_CLEARS, board, 'surplus', ['anti'], 'earned').grown).toBe(0);
  });
});

describe('the arrivals axis', () => {
  /**
   * The axis was a parameter nothing read for four tasks, and these two cases are what turned it
   * into a measurement. `'none'` means *no memory of anything* rather than "no arrivals" — see
   * `ArrivalPolicy` for the lever that was available and the vaccine isolation it costs — so both
   * halves of that sentence want holding:
   *
   * - handed a profile with memory, the two policies must play **different** games, or the
   *   arrivals comparison is four identical arms agreeing about nothing;
   * - handed a profile with no memory, they must play the **same** game board for board, because
   *   that is the claim `'none'` makes about itself and the only thing that makes a difference
   *   measured against it attributable to memory alone.
   *
   * Neither depends on `ARRIVALS_ENABLED`: the three strain vaccines are enough to separate the
   * arms on their own, which is exactly why the arrivals sweep has to run itself once with the
   * flag off before it can read its own memory-3 column.
   */
  const MEMORISED = CASES.length - 1;

  it('plays a different game under none when the profile has memory to lose', () => {
    const board = boardOf('phago');

    expect(playBoard(VACCINATED_CASE, MEMORISED, board, 'never', EVERY_GROWABLE, 'none'))
      .not.toEqual(playBoard(VACCINATED_CASE, MEMORISED, board, 'never', EVERY_GROWABLE, 'earned'));
  });

  it('plays the same game under either policy when there is no memory to take away', () => {
    const board = boardOf('phago');

    expect(playBoard(VACCINATED_CASE, 0, board, 'never', EVERY_GROWABLE, 'none'))
      .toEqual(playBoard(VACCINATED_CASE, 0, board, 'never', EVERY_GROWABLE, 'earned'));
  });
});

/**
 * The comparison builds one row per entry here, so an empty or short set does not fail the sweep —
 * it silently deletes the rows the trap assertion runs over, and the sweep passes having checked
 * nothing. The sweep is a deliberate command and cannot catch that on every change; this can.
 */
describe('EVERY_GROWABLE', () => {
  it('leaves out no kind the board would offer to grow', () => {
    const state = openState();
    for (const kind of DEFENDER_ORDER) {
      place(state, kind, 0);
      const offered = maturationAt(state, 0) !== null;
      reabsorbDefender(state, 0);
      expect(
        EVERY_GROWABLE.includes(kind),
        `the board offers to grow a ${kind} and the comparison never measures it`,
      ).toBe(offered);
    }
  });
});
