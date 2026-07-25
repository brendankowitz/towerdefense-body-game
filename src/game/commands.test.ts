import { describe, expect, it } from 'vitest';
import {
  isUnlocked, placeDefender, selectDefender, startWave, toggleSpeed, triggerFever, unlockedDefenders,
} from './commands';
import { createSimState } from './state';
import { CASE_BY_ID } from './content/cases';
import { DEFENDERS, DEFENDER_ORDER } from './content/defenders';
import { FEVER_DURATION, SPAWN_FIRST_DELAY, TOWER_MAX_HP } from './content/rules';
import type { DefenderKind, SimState } from './types';

function fresh(clearedCount = 0): SimState {
  return createSimState({
    caseId: 'forearm',
    immunity: { staph: 0, film: 0, virus: 0 },
    clearedCount,
    totalKills: 0,
  });
}

const MAX_UNLOCK = Math.max(...DEFENDER_ORDER.map((kind) => DEFENDERS[kind].unlock));

/** The cheapest defender available from the start — what the affordability tests reason about. */
const STARTER: DefenderKind = DEFENDER_ORDER.filter((kind) => DEFENDERS[kind].unlock === 0)
  .reduce((cheapest, kind) => (DEFENDERS[kind].cost < DEFENDERS[cheapest].cost ? kind : cheapest));

describe('selectDefender', () => {
  it('selects an unlocked defender and toggles it off when tapped twice', () => {
    const state = fresh(MAX_UNLOCK);
    const [first, second] = DEFENDER_ORDER;
    expect(second).toBeDefined();
    if (second === undefined || first === undefined) return;

    selectDefender(state, second);
    expect(state.selected).toBe(second);
    selectDefender(state, second);
    expect(state.selected).toBeNull();
    selectDefender(state, first);
    expect(state.selected).toBe(first);
  });

  it('ignores a defender that is still locked', () => {
    const state = fresh(0);
    const locked = DEFENDER_ORDER.find((kind) => DEFENDERS[kind].unlock > 0);
    expect(locked).toBeDefined();
    if (locked === undefined) return;

    const before = state.selected;
    selectDefender(state, locked);
    expect(state.selected).toBe(before);
  });
});

describe('unlockedDefenders', () => {
  it('offers exactly the defenders whose unlock tier is met, in dock order', () => {
    for (let cleared = 0; cleared <= MAX_UNLOCK + 1; cleared += 1) {
      const expected = DEFENDER_ORDER.filter((kind) => DEFENDERS[kind].unlock <= cleared);
      expect(unlockedDefenders(fresh(cleared))).toEqual(expected);
    }
  });

  it('offers every defender once every unlock tier is met', () => {
    expect(unlockedDefenders(fresh(MAX_UNLOCK))).toEqual(DEFENDER_ORDER);
  });

  it('agrees with isUnlocked', () => {
    const state = fresh(1);
    for (const kind of DEFENDER_ORDER) {
      expect(unlockedDefenders(state).includes(kind)).toBe(isUnlocked(state, kind));
    }
  });
});

describe('placeDefender', () => {
  it('places the selected defender, charges its cost and claims the spot', () => {
    const state = fresh();
    state.selected = STARTER;
    const before = state.energy;
    const [spotX, spotY] = CASE_BY_ID.forearm.spots[0] ?? [0, 0];

    expect(placeDefender(state, 0)).toBe(true);
    expect(state.towers).toHaveLength(1);
    expect(state.energy).toBe(before - DEFENDERS[STARTER].cost);

    const [tower] = state.towers;
    expect(tower?.kind).toBe(STARTER);
    expect(tower?.spotIndex).toBe(0);
    expect([tower?.x, tower?.y]).toEqual([spotX, spotY]);
    expect(tower?.hp).toBe(TOWER_MAX_HP);
  });

  it('refuses an occupied spot', () => {
    const state = fresh();
    state.selected = STARTER;
    placeDefender(state, 0);
    expect(placeDefender(state, 0)).toBe(false);
    expect(state.towers).toHaveLength(1);
  });

  it('refuses when energy is short, and charges nothing', () => {
    const state = fresh();
    state.selected = STARTER;
    state.energy = DEFENDERS[STARTER].cost - 1;

    expect(placeDefender(state, 0)).toBe(false);
    expect(state.towers).toHaveLength(0);
    expect(state.energy).toBe(DEFENDERS[STARTER].cost - 1);
  });

  it('places at exactly the cost, leaving nothing behind', () => {
    const state = fresh();
    state.selected = STARTER;
    state.energy = DEFENDERS[STARTER].cost;
    expect(placeDefender(state, 0)).toBe(true);
    expect(state.energy).toBe(0);
  });

  it('refuses with nothing selected', () => {
    const state = fresh();
    state.selected = null;
    expect(placeDefender(state, 0)).toBe(false);
  });

  it('refuses a spot index the case does not have', () => {
    const state = fresh();
    state.selected = STARTER;
    expect(placeDefender(state, CASE_BY_ID.forearm.spots.length)).toBe(false);
    expect(placeDefender(state, -1)).toBe(false);
  });

  it('builds the right shape for every defender kind', () => {
    for (const kind of DEFENDER_ORDER) {
      const state = fresh(MAX_UNLOCK);
      state.selected = kind;
      state.energy = DEFENDERS[kind].cost;
      expect(placeDefender(state, 0)).toBe(true);

      const [tower] = state.towers;
      expect(tower?.kind).toBe(kind);
      if (tower?.kind === 'phago') expect(tower.holdingEnemyId).toBeNull();
      if (tower?.kind === 'mem') expect(tower.xp).toBe(0);
    }
  });
});

describe('startWave', () => {
  it('fills the queue, arms the spawn timer and clears the selection', () => {
    const state = fresh();
    const expected = (CASE_BY_ID.forearm.waves[0] ?? []).reduce((sum, entry) => sum + entry.count, 0);

    startWave(state);

    expect(state.phase).toBe('wave');
    expect(state.queue).toHaveLength(expected);
    expect(state.selected).toBeNull();
    expect(state.spawnTimer).toBeCloseTo(SPAWN_FIRST_DELAY, 9);
  });

  it('resets the per-wave counters and the fever charge', () => {
    const state = fresh();
    state.waveKills = 7;
    state.waveLeaks = 2;
    state.feverUsed = true;
    state.fever = 3;
    state.result = 'wave';

    startWave(state);

    expect(state.waveKills).toBe(0);
    expect(state.waveLeaks).toBe(0);
    expect(state.feverUsed).toBe(false);
    expect(state.fever).toBe(0);
    expect(state.result).toBeNull();
  });

  it('does nothing while a wave is already running', () => {
    const state = fresh();
    startWave(state);
    const queued = [...state.queue];
    state.queue = [];

    startWave(state);

    expect(state.queue).toHaveLength(0);
    expect(queued.length).toBeGreaterThan(0);
  });
});

describe('triggerFever', () => {
  it('is available once per wave and only during a wave', () => {
    const state = fresh();

    triggerFever(state);
    expect(state.fever).toBe(0);

    startWave(state);
    triggerFever(state);
    expect(state.fever).toBe(FEVER_DURATION);
    expect(state.feverUsed).toBe(true);

    state.fever = 0;
    triggerFever(state);
    expect(state.fever).toBe(0);
  });

  it('is charged again by the next wave', () => {
    const state = fresh();
    startWave(state);
    triggerFever(state);
    state.phase = 'built';

    startWave(state);
    triggerFever(state);

    expect(state.fever).toBe(FEVER_DURATION);
  });
});

describe('toggleSpeed', () => {
  it('flips between normal and fast', () => {
    const state = fresh();
    expect(state.fast).toBe(false);
    toggleSpeed(state);
    expect(state.fast).toBe(true);
    toggleSpeed(state);
    expect(state.fast).toBe(false);
  });
});
