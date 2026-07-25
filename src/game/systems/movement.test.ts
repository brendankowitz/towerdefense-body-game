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
  state.towers.push({ kind: 'clot', spotIndex: 0, x, y, hp: TOWER_MAX_HP, stun: 0 });
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
});
