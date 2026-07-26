import { describe, expect, it } from 'vitest';
import {
  isUnlocked, matureDefender, placeDefender, reabsorbDefender, reabsorbValue, refundOf,
  selectDefender, startWave, toggleSpeed, towerAt, triggerFever, unlockedDefenders,
} from './commands';
import { createSimState } from './state';
import { statsFor } from './systems/stats';
import { CASE_BY_ID } from './content/cases';
import { DEFENDERS, DEFENDER_ORDER } from './content/defenders';
import { maturedFormOf } from './content/maturation';
import {
  FEVER_DURATION, REABSORB_REFUND, SPAWN_FIRST_DELAY, TOWER_MAX_HP,
} from './content/rules';
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

/** The kinds content gives a matured form, and the kinds it does not. Both are needed below. */
const GROWABLE = DEFENDER_ORDER.filter((kind) => maturedFormOf(kind) !== null);
const UNGROWABLE = DEFENDER_ORDER.filter((kind) => maturedFormOf(kind) === null);

/** Places `kind` on spot 0 of a funded board and hands back the state. */
function boardWith(kind: DefenderKind, extraEnergy = 0): SimState {
  const state = fresh(MAX_UNLOCK);
  state.selected = kind;
  state.energy = DEFENDERS[kind].cost + extraEnergy;
  if (!placeDefender(state, 0)) throw new Error(`Could not place ${kind} to set up the test`);
  return state;
}

function maturedCostOf(kind: DefenderKind): number {
  const form = maturedFormOf(kind);
  if (form === null) throw new Error(`${kind} has no matured form`);
  return form.cost;
}

describe('refundOf', () => {
  /** Plain arithmetic inputs, not content values: this is the rounding rule, not a balance figure. */
  const SPENDS = [0, 1, 7, 41, 99, 137, 250];

  it('never hands back more than went in', () => {
    for (const spent of SPENDS) {
      expect(refundOf(spent), `refund for ${String(spent)}`).toBeLessThanOrEqual(spent);
    }
  });

  it('pays in whole units, wherever the fraction lands', () => {
    for (const spent of SPENDS) {
      expect(Number.isInteger(refundOf(spent)), `refund for ${String(spent)}`).toBe(true);
    }
  });

  it('pays more back for a more expensive cell', () => {
    expect(refundOf(250)).toBeGreaterThan(refundOf(41));
  });
});

describe('reabsorbDefender', () => {
  it('has a defender with a matured form and one without, or the cases below are vacuous', () => {
    expect(GROWABLE.length).toBeGreaterThan(0);
    expect(UNGROWABLE.length).toBeGreaterThan(0);
  });

  it('returns the tunable share of what the cell cost and takes it off the board', () => {
    for (const kind of DEFENDER_ORDER) {
      const state = boardWith(kind);
      expect(state.energy).toBe(0);

      expect(reabsorbDefender(state, 0)).toBe(true);
      expect(state.towers).toHaveLength(0);
      expect(state.energy).toBe(Math.floor(DEFENDERS[kind].cost * REABSORB_REFUND));
    }
  });

  it('keeps back a share, so placing is never free to undo', () => {
    for (const kind of DEFENDER_ORDER) {
      const state = boardWith(kind);
      reabsorbDefender(state, 0);
      expect(state.energy, `${kind} refunded everything it cost`).toBeLessThan(DEFENDERS[kind].cost);
    }
  });

  it('refunds a grown cell for its maturation as well as its placement', () => {
    for (const kind of GROWABLE) {
      const grown = boardWith(kind, maturedCostOf(kind));
      expect(matureDefender(grown, 0)).toBe(true);

      const plain = boardWith(kind);
      const plainTower = towerAt(plain, 0);
      const grownTower = towerAt(grown, 0);
      expect(plainTower).not.toBeNull();
      expect(grownTower).not.toBeNull();
      if (plainTower === null || grownTower === null) return;

      expect(reabsorbValue(grownTower)).toBe(
        Math.floor((DEFENDERS[kind].cost + maturedCostOf(kind)) * REABSORB_REFUND),
      );
      expect(reabsorbValue(grownTower)).toBeGreaterThan(reabsorbValue(plainTower));
    }
  });

  it('frees the spot to build on again', () => {
    const state = boardWith(STARTER, DEFENDERS[STARTER].cost);
    reabsorbDefender(state, 0);

    state.selected = STARTER;
    expect(placeDefender(state, 0)).toBe(true);
    expect(state.towers).toHaveLength(1);
  });

  it('refuses while a wave is running, and pays nothing out', () => {
    const state = boardWith(STARTER);
    startWave(state);
    expect(state.phase).toBe('wave');
    const banked = state.energy;

    expect(reabsorbDefender(state, 0)).toBe(false);
    expect(state.towers).toHaveLength(1);
    expect(state.energy).toBe(banked);
  });

  it('is available again once the wave is held', () => {
    const state = boardWith(STARTER);
    startWave(state);
    state.phase = 'built';

    expect(reabsorbDefender(state, 0)).toBe(true);
  });

  it('refuses a spot with nothing on it, and pays nothing out', () => {
    const state = boardWith(STARTER);
    const banked = state.energy;

    expect(reabsorbDefender(state, 1)).toBe(false);
    expect(state.towers).toHaveLength(1);
    expect(state.energy).toBe(banked);
  });

  it('takes back only the cell asked for', () => {
    const state = fresh(MAX_UNLOCK);
    state.energy = DEFENDERS[STARTER].cost * 3;
    state.selected = STARTER;
    placeDefender(state, 0);
    placeDefender(state, 1);
    placeDefender(state, 2);

    expect(reabsorbDefender(state, 1)).toBe(true);
    expect(state.towers.map((tower) => tower.spotIndex)).toEqual([0, 2]);
  });
});

describe('matureDefender', () => {
  it('charges the form its cost and applies every stat it overrides', () => {
    for (const kind of GROWABLE) {
      const cost = maturedCostOf(kind);
      const state = boardWith(kind, cost);

      expect(matureDefender(state, 0)).toBe(true);
      expect(state.energy).toBe(0);

      const tower = towerAt(state, 0);
      expect(tower).not.toBeNull();
      if (tower === null) return;
      expect(tower.matured).toBe(true);
      expect(tower.kind).toBe(kind);

      const form = maturedFormOf(kind);
      const grown: Record<string, unknown> = { ...statsFor(tower) };
      for (const [field, value] of Object.entries(form?.stats ?? {})) {
        expect(grown[field], `${kind}.${field} did not take the matured value`).toBe(value);
      }
    }
  });

  it('refuses a second time — a cell matures once', () => {
    for (const kind of GROWABLE) {
      const cost = maturedCostOf(kind);
      const state = boardWith(kind, cost * 2);

      expect(matureDefender(state, 0)).toBe(true);
      const banked = state.energy;
      expect(banked).toBeGreaterThanOrEqual(cost);

      expect(matureDefender(state, 0)).toBe(false);
      expect(state.energy).toBe(banked);
    }
  });

  it('refuses without the energy, and charges nothing', () => {
    for (const kind of GROWABLE) {
      const state = boardWith(kind, maturedCostOf(kind) - 1);
      const banked = state.energy;

      expect(matureDefender(state, 0)).toBe(false);
      expect(state.energy).toBe(banked);
      expect(towerAt(state, 0)?.matured).toBe(false);
    }
  });

  it('grows at exactly the cost, leaving nothing behind', () => {
    for (const kind of GROWABLE) {
      const state = boardWith(kind, maturedCostOf(kind));
      expect(matureDefender(state, 0)).toBe(true);
      expect(state.energy).toBe(0);
    }
  });

  it('refuses while a wave is running, and charges nothing', () => {
    for (const kind of GROWABLE) {
      const state = boardWith(kind, maturedCostOf(kind));
      startWave(state);
      expect(state.phase).toBe('wave');
      const banked = state.energy;

      expect(matureDefender(state, 0)).toBe(false);
      expect(towerAt(state, 0)?.matured).toBe(false);
      expect(state.energy).toBe(banked);
    }
  });

  it('refuses a cell content gives no matured form', () => {
    for (const kind of UNGROWABLE) {
      const state = boardWith(kind, Number.MAX_SAFE_INTEGER);
      const banked = state.energy;

      expect(matureDefender(state, 0)).toBe(false);
      expect(towerAt(state, 0)?.matured).toBe(false);
      expect(state.energy).toBe(banked);
    }
  });

  it('refuses a spot with nothing on it', () => {
    const kind = GROWABLE[0];
    expect(kind).toBeDefined();
    if (kind === undefined) return;

    const state = boardWith(kind, maturedCostOf(kind));
    const banked = state.energy;

    expect(matureDefender(state, 1)).toBe(false);
    expect(state.energy).toBe(banked);
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
