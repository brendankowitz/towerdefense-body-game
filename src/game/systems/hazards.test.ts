import { describe, expect, it } from 'vitest';
import { applyPoison, applyToxinStun, applyWoundBleed } from './hazards';
import { PATHOGENS } from '../content/pathogens';
import {
  BLEED_AMOUNT,
  BLEED_INTERVAL,
  POISON_DPS_ANTIBODY,
  POISON_DPS_OTHER,
  POISON_RADIUS,
  STEP_SECONDS,
  TOWER_MAX_HP,
  TOXIN_STUN_RADIUS,
} from '../content/rules';
import { distance } from '../state';
import { step } from '../step';
import { addEnemy, addTower, addTowerOnPath, simFor } from '../testing';
import type { SimState } from '../types';

/** The wound rule is the bleed's precondition, so a case reshuffle fails here rather than silently. */
function wound(): SimState {
  const state = simFor('forearm');
  expect(state.rule).toBe('wound');
  return state;
}

/** Likewise for poison. Only the stomach case damages defenders directly. */
function poisoned(): SimState {
  const state = simFor('stomach');
  expect(state.rule).toBe('poison');
  return state;
}

describe('wound — bleeding', () => {
  /**
   * The second interval is what makes this a test of the *interval* rather than of the first
   * tick: an implementation that stops resetting its timer drains on every call once the first
   * one lands, and the two-call version of this test could not tell the difference.
   */
  it('drains energy once per bleed interval, however often it is called', () => {
    const state = wound();
    const before = state.energy;
    const half = BLEED_INTERVAL / 2;

    applyWoundBleed(state, half);
    expect(state.energy).toBe(before);

    applyWoundBleed(state, half);
    expect(state.energy).toBe(before - BLEED_AMOUNT);

    applyWoundBleed(state, half);
    expect(state.energy).toBe(before - BLEED_AMOUNT);

    applyWoundBleed(state, half);
    expect(state.energy).toBe(before - 2 * BLEED_AMOUNT);
  });

  it('stops bleeding as soon as a clot exists', () => {
    const state = wound();
    addTower(state, 'clot', 0, 0, 0);
    const before = state.energy;

    applyWoundBleed(state, BLEED_INTERVAL * 3);

    expect(state.energy).toBe(before);
  });

  it('resumes bleeding if the only clot wears away', () => {
    const state = wound();
    const clot = addTower(state, 'clot', 0, 0, 0);
    const before = state.energy;

    applyWoundBleed(state, BLEED_INTERVAL);
    expect(state.energy).toBe(before);

    clot.hp = 0;
    state.towers = state.towers.filter((tower) => tower.hp > 0);
    applyWoundBleed(state, BLEED_INTERVAL);

    expect(state.energy).toBe(before - BLEED_AMOUNT);
  });

  it('is stopped by a clot anywhere on the board, not one near the wound', () => {
    const state = wound();
    addTower(state, 'clot', 0, -1000, -1000);
    const before = state.energy;

    applyWoundBleed(state, BLEED_INTERVAL * 3);

    expect(state.energy).toBe(before);
  });

  it('does not bleed outside a wound case', () => {
    for (const caseId of ['throat', 'stomach'] as const) {
      const state = simFor(caseId);
      expect(state.rule).not.toBe('wound');
      const before = state.energy;

      applyWoundBleed(state, BLEED_INTERVAL * 3);

      expect(state.energy).toBe(before);
    }
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

describe('toxin — stuns the cells it passes', () => {
  const stun = PATHOGENS.toxin.stun ?? 0;

  it('stuns a defender inside the stun radius', () => {
    expect(stun).toBeGreaterThan(0);

    const state = poisoned();
    const tower = addTower(state, 'phago', 0, 0, 0);
    const toxin = addEnemy(state, 'toxin', { x: TOXIN_STUN_RADIUS - 1, y: 0 });

    applyToxinStun(state, toxin);

    expect(tower.stun).toBe(stun);
  });

  it('leaves a defender at the stun radius or further alone', () => {
    const state = poisoned();
    const tower = addTower(state, 'phago', 0, 0, 0);
    const toxin = addEnemy(state, 'toxin', { x: TOXIN_STUN_RADIUS, y: 0 });

    applyToxinStun(state, toxin);

    expect(tower.stun).toBe(0);
  });

  it('cannot stun a clot', () => {
    const state = poisoned();
    const tower = addTower(state, 'clot', 0, 0, 0);
    const toxin = addEnemy(state, 'toxin', { x: 0, y: 0 });

    applyToxinStun(state, toxin);

    expect(tower.stun).toBe(0);
  });

  it('cannot stun a memory cell — its stated perk', () => {
    const state = poisoned();
    const tower = addTower(state, 'mem', 0, 0, 0);
    const toxin = addEnemy(state, 'toxin', { x: 0, y: 0 });

    applyToxinStun(state, toxin);

    expect(tower.stun).toBe(0);
  });

  it('stuns everything else — engulf, tag, execute and burst alike', () => {
    expect(stun).toBeGreaterThan(0);

    const state = poisoned();
    const phago = addTower(state, 'phago', 0, 0, 0);
    const anti = addTower(state, 'anti', 1, 0, 0);
    const nk = addTower(state, 'nk', 2, 0, 0);
    const mast = addTower(state, 'mast', 3, 0, 0);
    const toxin = addEnemy(state, 'toxin', { x: 0, y: 0 });

    applyToxinStun(state, toxin);

    expect([phago.stun, anti.stun, nk.stun, mast.stun]).toEqual([stun, stun, stun, stun]);
  });

  it('refreshes a shorter stun rather than stacking on top of it', () => {
    expect(stun).toBeGreaterThan(0);

    const state = poisoned();
    const tower = addTower(state, 'phago', 0, 0, 0);
    tower.stun = stun / 2;
    const toxin = addEnemy(state, 'toxin', { x: 0, y: 0 });

    applyToxinStun(state, toxin);

    expect(tower.stun).toBe(stun);
  });

  it('never shortens a longer stun already running', () => {
    expect(stun).toBeGreaterThan(0);

    const state = poisoned();
    const tower = addTower(state, 'phago', 0, 0, 0);
    tower.stun = stun * 2;
    const toxin = addEnemy(state, 'toxin', { x: 0, y: 0 });

    applyToxinStun(state, toxin);

    expect(tower.stun).toBe(stun * 2);
  });

  it('does nothing for a pathogen that does not stun', () => {
    expect(PATHOGENS.staph.stun).toBeUndefined();

    const state = poisoned();
    const tower = addTower(state, 'phago', 0, 0, 0);
    const staph = addEnemy(state, 'staph', { x: 0, y: 0 });

    applyToxinStun(state, staph);

    expect(tower.stun).toBe(0);
  });

  it('stuns in every case, not only the poison one', () => {
    expect(stun).toBeGreaterThan(0);

    const state = simFor('forearm');
    const tower = addTower(state, 'phago', 0, 0, 0);
    const toxin = addEnemy(state, 'toxin', { x: 0, y: 0 });

    applyToxinStun(state, toxin);

    expect(tower.stun).toBe(stun);
  });
});

describe('poison — pathogens damage your defenders', () => {
  it('damages a phagocyte inside the poison radius at the full rate', () => {
    const state = poisoned();
    const tower = addTower(state, 'phago', 0, 0, 0);
    const enemy = addEnemy(state, 'staph', { x: POISON_RADIUS - 1, y: 0 });

    applyPoison(state, enemy, 1);

    expect(tower.hp).toBeCloseTo(TOWER_MAX_HP - POISON_DPS_OTHER, 6);
  });

  it('damages an antibody at its reduced rate', () => {
    const state = poisoned();
    const tower = addTower(state, 'anti', 0, 0, 0);
    const enemy = addEnemy(state, 'staph', { x: 0, y: 0 });

    applyPoison(state, enemy, 1);

    expect(tower.hp).toBeCloseTo(TOWER_MAX_HP - POISON_DPS_ANTIBODY, 6);
  });

  it('wears an antibody down more slowly than a phagocyte standing beside it', () => {
    expect(POISON_DPS_ANTIBODY).toBeLessThan(POISON_DPS_OTHER);

    const state = poisoned();
    const phago = addTower(state, 'phago', 0, 0, 0);
    const anti = addTower(state, 'anti', 1, 0, 0);
    const enemy = addEnemy(state, 'staph', { x: 0, y: 0 });

    applyPoison(state, enemy, 5);

    expect(TOWER_MAX_HP - anti.hp).toBeLessThan(TOWER_MAX_HP - phago.hp);
  });

  it('cannot damage a clot', () => {
    const state = poisoned();
    const tower = addTower(state, 'clot', 0, 0, 0);
    const enemy = addEnemy(state, 'staph', { x: 0, y: 0 });

    applyPoison(state, enemy, 1);

    expect(tower.hp).toBe(TOWER_MAX_HP);
  });

  /**
   * Decision D8, and the reason the two hazards do not share an exemption list: the memory cell
   * is immune to being *stunned*, which is its stated perk, not to being poisoned. Full immunity
   * would make Learn strictly dominant in the one case built to punish standing in the wrong place.
   */
  it('does damage a memory cell — stun immunity is not poison immunity — decision D8', () => {
    const state = poisoned();
    const mem = addTower(state, 'mem', 0, 0, 0);
    const toxin = addEnemy(state, 'toxin', { x: 0, y: 0 });

    applyToxinStun(state, toxin);
    applyPoison(state, toxin, 1);

    expect(mem.stun).toBe(0);
    expect(mem.hp).toBeCloseTo(TOWER_MAX_HP - POISON_DPS_OTHER, 6);
  });

  it('leaves a defender at the poison radius or further alone', () => {
    const state = poisoned();
    const tower = addTower(state, 'phago', 0, 0, 0);
    const enemy = addEnemy(state, 'staph', { x: POISON_RADIUS, y: 0 });

    applyPoison(state, enemy, 1);

    expect(tower.hp).toBe(TOWER_MAX_HP);
  });

  it('is dealt by every pathogen, not only the toxin', () => {
    const state = poisoned();
    const tower = addTower(state, 'phago', 0, 0, 0);
    const enemy = addEnemy(state, 'film', { x: 0, y: 0 });

    applyPoison(state, enemy, 1);

    expect(tower.hp).toBeCloseTo(TOWER_MAX_HP - POISON_DPS_OTHER, 6);
  });

  it('does nothing outside a poison case', () => {
    for (const caseId of ['forearm', 'throat'] as const) {
      const state = simFor(caseId);
      expect(state.rule).not.toBe('poison');
      const tower = addTower(state, 'phago', 0, 0, 0);
      const enemy = addEnemy(state, 'staph', { x: 0, y: 0 });

      applyPoison(state, enemy, 10);

      expect(tower.hp).toBe(TOWER_MAX_HP);
    }
  });

  /**
   * The one behaviour the hazard function cannot show on its own: `step` sweeps a defender off
   * the board once poison has finished it. Seeded with exactly one step's worth of health so the
   * removal is pinned by construction rather than by how much damage a step happens to do.
   */
  it('removes a defender from the board once poison finishes it', () => {
    const state = poisoned();
    const tower = addTowerOnPath(state, 'phago', 0);
    tower.hp = POISON_DPS_OTHER * STEP_SECONDS;
    const enemy = addEnemy(state, 'staph', { distance: 0 });

    step(state, STEP_SECONDS);

    expect(distance(tower.x, tower.y, enemy.x, enemy.y)).toBeLessThan(POISON_RADIUS);
    expect(state.towers).toHaveLength(0);
  });

  it('leaves a defender standing with a sliver of health left', () => {
    const state = poisoned();
    const tower = addTowerOnPath(state, 'phago', 0);
    tower.hp = POISON_DPS_OTHER * STEP_SECONDS * 2;
    addEnemy(state, 'staph', { distance: 0 });

    step(state, STEP_SECONDS);

    expect(state.towers).toEqual([tower]);
    expect(tower.hp).toBeCloseTo(POISON_DPS_OTHER * STEP_SECONDS, 6);
  });
});
