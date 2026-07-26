import { describe, expect, it } from 'vitest';
import { placeDefender, towerAt } from '../../src/game/commands';
import { DEFENDERS } from '../../src/game/content/defenders';
import { maturedFormOf } from '../../src/game/content/maturation';
import { createSimState } from '../../src/game/state';
import type { DefenderKind, SimState } from '../../src/game/types';
import {
  growCheapestFirst, immunityAfter, playBoard, runBuildPhase, type MaturationPolicy,
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

function openState(): SimState {
  return createSimState({
    caseId: CASE_ID, immunity: immunityAfter(0), clearedCount: 0, totalKills: 0,
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

    expect(growCheapestFirst(state)).toBe(1);
    expect(isMatured(state, 0)).toBe(true);
    expect(isMatured(state, 1)).toBe(false);
  });

  it('breaks a tie between two of the same form on spot index, not on placement order', () => {
    const state = openState();
    place(state, 'phago', 3);
    place(state, 'phago', 1);
    state.energy = growthCost('phago');

    expect(growCheapestFirst(state)).toBe(1);
    expect(isMatured(state, 1)).toBe(true);
    expect(isMatured(state, 3)).toBe(false);
  });
});

describe('runBuildPhase', () => {
  function phaseOn(
    policy: MaturationPolicy,
    energy: number,
    placed: number,
    board: readonly DefenderKind[] = boardOf('phago'),
  ): { readonly built: number; readonly grown: number } {
    const state = openState();
    for (let spotIndex = 0; spotIndex < placed; spotIndex += 1) place(state, 'phago', spotIndex);
    state.energy = energy;
    return runBuildPhase(state, board, policy);
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
});

describe('playBoard', () => {
  it('carries the policy through a whole run', () => {
    const board = boardOf('phago');

    const never = playBoard(CASE_ID, 0, board, 'never');
    const surplus = playBoard(CASE_ID, 0, board, 'surplus');

    expect(never.grown).toBe(0);
    // Surplus only ever grows on a standing board, so this also says the board was built.
    expect(surplus.grown).toBeGreaterThan(0);
  });
});
