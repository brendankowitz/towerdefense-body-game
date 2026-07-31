import { describe, expect, it } from 'vitest';
import { applyMovement } from './movement';
import { createSimState } from '../state';
import { DEFENDERS } from '../content/defenders';
import { PATHOGENS } from '../content/pathogens';
import { FEVER_SLOW, SPLIT_SPEED_FACTOR, TISSUE_PIPS, TOWER_MAX_HP } from '../content/rules';
import { positionAt } from '../path';
import type { CaseId, Enemy, PathogenKind, SimState } from '../types';

function fresh(caseId: CaseId = 'forearm'): SimState {
  const state = createSimState({
    caseId,
    immunity: { staph: 0, film: 0, virus: 0 },
    clearedCount: 0,
    day: 1,
    totalKills: 0,
  });
  state.phase = 'wave';
  return state;
}

function spawn(state: SimState, kind: PathogenKind, at = 0, generation: 0 | 1 = 0): Enemy {
  const stats = PATHOGENS[kind];
  const [x, y] = positionAt(state.path, at);
  const enemy: Enemy = {
    id: state.nextEnemyId, kind, distance: at, x, y,
    hp: stats.hp, maxHp: stats.hp, tag: 0, generation,
  };
  state.nextEnemyId += 1;
  state.enemies.push(enemy);
  return enemy;
}

/** A clot sitting on the path head, so anything at distance 0 is inside it. */
function clotAtStart(state: SimState): void {
  const [x, y] = positionAt(state.path, 0);
  state.towers.push({ kind: 'clot', spotIndex: 0, x, y, hp: TOWER_MAX_HP, stun: 0, matured: false });
}

describe('applyMovement', () => {
  it('advances an enemy by its speed times dt', () => {
    const state = fresh();
    const enemy = spawn(state, 'staph');
    applyMovement(state, 1, new Set(), new Set());
    expect(enemy.distance).toBeCloseTo(PATHOGENS.staph.speed, 6);
  });

  it('advances each pathogen at its own speed', () => {
    const state = fresh();
    const enemies = (Object.keys(PATHOGENS) as PathogenKind[]).map((kind) => spawn(state, kind));
    applyMovement(state, 1, new Set(), new Set());
    for (const enemy of enemies) {
      expect(enemy.distance).toBeCloseTo(PATHOGENS[enemy.kind].speed, 6);
    }
  });

  it('keeps position in step with distance along the path', () => {
    const state = fresh();
    const enemy = spawn(state, 'staph');
    applyMovement(state, 1, new Set(), new Set());
    expect([enemy.x, enemy.y]).toEqual(positionAt(state.path, enemy.distance));
  });

  it('freezes an engulfed enemy in place', () => {
    const state = fresh();
    const enemy = spawn(state, 'staph');
    applyMovement(state, 1, new Set([enemy.id]), new Set());
    expect(enemy.distance).toBe(0);
  });

  it('slows everything by the fever factor while fever is active', () => {
    const state = fresh();
    state.fever = 1;
    const enemy = spawn(state, 'staph');
    applyMovement(state, 1, new Set(), new Set());
    expect(enemy.distance).toBeCloseTo(PATHOGENS.staph.speed * FEVER_SLOW, 6);
  });

  it('moves a split child more slowly than its parent', () => {
    const state = fresh('throat');
    const parent = spawn(state, 'virus');
    const child = spawn(state, 'virus', 0, 1);
    applyMovement(state, 1, new Set(), new Set());
    expect(child.distance).toBeCloseTo(parent.distance * SPLIT_SPEED_FACTOR, 6);
    expect(child.distance).toBeLessThan(parent.distance);
  });

  it('burns a tagged enemy at the tag damage rate and runs the tag down', () => {
    const state = fresh();
    const enemy = spawn(state, 'staph');
    enemy.tag = 1;
    applyMovement(state, 0.5, new Set(), new Set());
    expect(enemy.hp).toBeCloseTo(enemy.maxHp - DEFENDERS.anti.dot * 0.5, 6);
    expect(enemy.tag).toBeCloseTo(0.5, 6);
  });

  it('regenerates an untagged regenerator, capped at full health', () => {
    const state = fresh('throat');
    const regen = PATHOGENS.spore.regen ?? 0;
    expect(regen).toBeGreaterThan(0);

    const enemy = spawn(state, 'spore');
    enemy.hp = enemy.maxHp - 2 * regen;
    applyMovement(state, 1, new Set(), new Set());
    expect(enemy.hp).toBeCloseTo(enemy.maxHp - regen, 6);

    enemy.hp = enemy.maxHp - regen / 2;
    applyMovement(state, 1, new Set(), new Set());
    expect(enemy.hp).toBe(enemy.maxHp);
  });

  it('stops a regenerator healing while it is tagged', () => {
    const state = fresh('throat');
    const enemy = spawn(state, 'spore');
    const wound = (PATHOGENS.spore.regen ?? 0) * 3;
    enemy.hp = enemy.maxHp - wound;
    enemy.tag = 6;
    applyMovement(state, 1, new Set(), new Set());
    expect(enemy.hp).toBeCloseTo(enemy.maxHp - wound - DEFENDERS.anti.dot, 6);
  });

  it('slows anything inside a clot and wears the clot down', () => {
    const state = fresh();
    const enemy = spawn(state, 'staph');
    clotAtStart(state);
    applyMovement(state, 1, new Set(), new Set());
    expect(enemy.distance).toBeCloseTo(PATHOGENS.staph.speed * DEFENDERS.clot.slow, 6);
    expect(state.towers[0]?.hp).toBeCloseTo(TOWER_MAX_HP - DEFENDERS.clot.wear, 6);
  });

  it('never lets a clot speed anything up', () => {
    const state = fresh();
    const enemy = spawn(state, 'staph');
    clotAtStart(state);
    state.fever = 1;
    applyMovement(state, 1, new Set(), new Set());
    const slowest = Math.min(FEVER_SLOW, DEFENDERS.clot.slow);
    expect(enemy.distance).toBeCloseTo(PATHOGENS.staph.speed * slowest, 6);
  });

  it('leaves an engulfed enemy frozen even inside a clot', () => {
    const state = fresh();
    const enemy = spawn(state, 'staph');
    clotAtStart(state);
    applyMovement(state, 1, new Set([enemy.id]), new Set());
    expect(enemy.distance).toBe(0);
  });

  it('wears a clot once per body inside it — deliberate, decision D10', () => {
    const state = fresh();
    spawn(state, 'staph');
    spawn(state, 'staph');
    clotAtStart(state);
    applyMovement(state, 1, new Set(), new Set());
    expect(state.towers[0]?.hp).toBeCloseTo(TOWER_MAX_HP - 2 * DEFENDERS.clot.wear, 6);
  });

  /**
   * Decision D10, spec §5.1. Load-proportional wear is kept deliberately: a clot under a crowd
   * buckles in a fraction of the time it survives a single body. Held enemies stand still inside
   * the zone so the comparison measures wear, not how fast anything walked out of it.
   */
  it('is destroyed far sooner by a crowd than by one body — decision D10', () => {
    function secondsToFail(bodies: number): number {
      const state = fresh();
      const held = new Set<number>();
      for (let i = 0; i < bodies; i += 1) held.add(spawn(state, 'staph').id);
      clotAtStart(state);

      for (let elapsed = 1; elapsed <= 600; elapsed += 1) {
        applyMovement(state, 1, held, new Set());
        if ((state.towers[0]?.hp ?? 0) <= 0) return elapsed;
      }
      throw new Error(`a clot under ${String(bodies)} bodies never failed`);
    }

    expect(secondsToFail(4)).toBeLessThan(secondsToFail(1));
  });

  it('costs one tissue pip when an enemy reaches the end', () => {
    const state = fresh();
    const enemy = spawn(state, 'staph', state.path.total - 1);
    const dead = new Set<number>();
    applyMovement(state, 1, new Set(), dead);
    expect(dead.has(enemy.id)).toBe(true);
    expect(state.tissue).toBe(TISSUE_PIPS - 1);
    expect(state.waveLeaks).toBe(1);
  });

  it('does not leak an enemy that is still short of the end', () => {
    const state = fresh();
    spawn(state, 'staph', 0);
    const dead = new Set<number>();
    applyMovement(state, 1, new Set(), dead);
    expect(dead.size).toBe(0);
    expect(state.tissue).toBe(TISSUE_PIPS);
  });

  /**
   * What a body costs on the way out is the body's, not a constant — the whole of the overreaction
   * rule's other half. Pollen reaching the core does nothing, which is what makes letting it
   * through a move the player is allowed to make.
   *
   * The two are asserted against each other on the same case rather than against the literal 1, so
   * this measures the difference the field makes and not the number that happens to be in it.
   */
  it('charges what the pathogen says a leak costs, so a harmless one is free', () => {
    expect(PATHOGENS.pollen.leak).toBe(0);
    expect(PATHOGENS.staph.leak).toBeUndefined();

    const harmless = fresh();
    const harmful = fresh();
    spawn(harmless, 'pollen', harmless.path.total - 1);
    spawn(harmful, 'staph', harmful.path.total - 1);

    applyMovement(harmless, 1, new Set(), new Set());
    applyMovement(harmful, 1, new Set(), new Set());

    expect(harmless.tissue, 'pollen through the core cost a pip').toBe(TISSUE_PIPS);
    expect(harmful.tissue).toBe(TISSUE_PIPS - 1);
    // Still a leak: it got past everything, and the result sheet should say so.
    expect(harmless.waveLeaks).toBe(1);
  });
});

/**
 * Decision D25. `applyMovement` calls `applyPoison` once per enemy, so a crowd poisons
 * proportionally — the same shape as D10's clot wear, in the same loop, kept for the same reason.
 *
 * These drive `applyMovement` rather than `applyPoison` directly, because the stacking is a
 * property of the call site and not of the function. An earlier pair called `applyPoison` in a
 * loop and asserted it accumulated, which is true however the caller behaves: removing the
 * stacking from this file left both of them green.
 */
describe('poison and the crowd — decision D25', () => {
  function phagoAtStart(state: SimState): void {
    const [x, y] = positionAt(state.path, 0);
    state.towers.push({
      kind: 'phago', spotIndex: 0, x, y, hp: TOWER_MAX_HP, stun: 0, matured: false,
      holdingEnemyId: null, digested: 0, rest: 0,
    });
  }

  /** Held, so they stay on top of the cell and the comparison measures poison, not walking. */
  function damageFrom(bodies: number): number {
    const state = fresh('stomach');
    const held = new Set<number>();
    for (let i = 0; i < bodies; i += 1) held.add(spawn(state, 'staph').id);
    phagoAtStart(state);

    applyMovement(state, 1, held, new Set());
    return TOWER_MAX_HP - (state.towers[0]?.hp ?? 0);
  }

  it('costs a cell once for every body standing on it', () => {
    const one = damageFrom(1);
    expect(one).toBeGreaterThan(0);
    expect(damageFrom(3), 'three bodies cost three times one').toBeCloseTo(one * 3, 6);
  });

  it('kills a cell far sooner under a crowd than under a single body', () => {
    function secondsToFail(bodies: number): number {
      const state = fresh('stomach');
      const held = new Set<number>();
      for (let i = 0; i < bodies; i += 1) held.add(spawn(state, 'staph').id);
      phagoAtStart(state);

      for (let elapsed = 1; elapsed <= 600; elapsed += 1) {
        applyMovement(state, 1, held, new Set());
        if ((state.towers[0]?.hp ?? 0) <= 0) return elapsed;
      }
      throw new Error(`a cell under ${String(bodies)} bodies never died`);
    }

    expect(secondsToFail(4)).toBeLessThan(secondsToFail(1));
  });
});
