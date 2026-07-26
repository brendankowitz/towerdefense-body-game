import { describe, expect, it } from 'vitest';
import { createSimState, distance } from './state';
import { CASES, CASE_BY_ID } from './content/cases';
import { TISSUE_PIPS } from './content/rules';
import { compilePath } from './path';
import type { SimInput } from './state';

const input: SimInput = {
  caseId: 'forearm',
  immunity: { staph: 0, film: 0, virus: 0 },
  clearedCount: 0,
  totalKills: 0,
};

describe('createSimState', () => {
  it('starts in build phase with the case starting energy and full tissue', () => {
    const state = createSimState(input);
    expect(state.phase).toBe('build');
    expect(state.energy).toBe(CASE_BY_ID.forearm.startingEnergy);
    expect(state.tissue).toBe(TISSUE_PIPS);
    expect(state.waveCount).toBe(CASE_BY_ID.forearm.waves.length);
  });

  it('preselects the phagocyte, as the prototype does on case start', () => {
    expect(createSimState(input).selected).toBe('phago');
  });

  it('starts with nothing on the board and no result', () => {
    const state = createSimState(input);
    expect(state.towers).toHaveLength(0);
    expect(state.enemies).toHaveLength(0);
    expect(state.queue).toHaveLength(0);
    expect(state.result).toBeNull();
  });

  it('compiles the case path it was asked for', () => {
    for (const shipped of CASES) {
      const state = createSimState({ ...input, caseId: shipped.id });
      expect(state.rule).toBe(shipped.rule);
      expect(state.path.total).toBe(compilePath(shipped.path).total);
    }
  });

  it('carries profile facts in without letting the case override them', () => {
    const state = createSimState({ ...input, immunity: { staph: 2, film: 1, virus: 3 }, clearedCount: 2, totalKills: 41 });
    expect(state.immunity).toEqual({ staph: 2, film: 1, virus: 3 });
    expect(state.clearedCount).toBe(2);
    expect(state.totalKills).toBe(41);
  });

  /**
   * Decision D2. The prototype held the spent-shield marker on a loop instance field that
   * `startCase` never reset, so replaying a case silently lost the tetanus bounce.
   */
  it('resets the spent tetanus shield at case start — decision D2', () => {
    const first = createSimState(input);
    first.shieldedWave = 4;
    expect(createSimState(input).shieldedWave).toBeNull();
  });
});

describe('distance', () => {
  it('measures a 3-4-5 triangle', () => {
    expect(distance(0, 0, 3, 4)).toBe(5);
  });

  it('is zero for coincident points', () => {
    expect(distance(7, 7, 7, 7)).toBe(0);
  });

  it('is symmetric in its arguments', () => {
    expect(distance(-3, 11, 8, -2)).toBe(distance(8, -2, -3, 11));
  });
});
