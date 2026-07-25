import { describe, expect, it } from 'vitest';
import { applyWoundBleed } from './hazards';
import { createSimState } from '../state';
import { BLEED_AMOUNT, BLEED_INTERVAL, TOWER_MAX_HP } from '../content/rules';
import type { CaseId, SimState } from '../types';

// The toxin-stun and poison suites land in Phase 7 with the rest of the case rules. The bleed
// clamp is here because it is a spec §5.1 correction and needs its proof in this phase.

function simFor(caseId: CaseId): SimState {
  const state = createSimState({
    caseId,
    immunity: { staph: 0, film: 0, virus: 0 },
    clearedCount: 0,
    totalKills: 0,
  });
  state.phase = 'wave';
  return state;
}

function wound(): SimState {
  const state = simFor('forearm');
  expect(state.rule).toBe('wound');
  return state;
}

describe('applyWoundBleed', () => {
  it('drains energy once per bleed interval', () => {
    const state = wound();
    const before = state.energy;

    applyWoundBleed(state, BLEED_INTERVAL / 2);
    expect(state.energy).toBe(before);

    applyWoundBleed(state, BLEED_INTERVAL / 2);
    expect(state.energy).toBe(before - BLEED_AMOUNT);
  });

  it('stops bleeding as soon as a clot exists', () => {
    const state = wound();
    state.towers.push({ kind: 'clot', spotIndex: 0, x: 0, y: 0, hp: TOWER_MAX_HP, stun: 0 });
    const before = state.energy;
    applyWoundBleed(state, BLEED_INTERVAL * 3);
    expect(state.energy).toBe(before);
  });

  it('does not bleed outside a wound case', () => {
    const state = simFor('throat');
    const before = state.energy;
    applyWoundBleed(state, BLEED_INTERVAL * 3);
    expect(state.energy).toBe(before);
  });

  /**
   * Decision D3. The prototype's guard was `if (energy > 0) energy -= 2`, so a bleed starting
   * from anything below the bleed amount left energy negative and only the HUD hid it.
   */
  it('clamps energy at zero rather than letting it go negative — decision D3', () => {
    const state = wound();
    state.energy = BLEED_AMOUNT / 2;

    applyWoundBleed(state, BLEED_INTERVAL);
    expect(state.energy).toBe(0);

    applyWoundBleed(state, BLEED_INTERVAL);
    expect(state.energy).toBe(0);
  });
});
