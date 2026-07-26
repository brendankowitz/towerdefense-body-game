import { describe, expect, it } from 'vitest';
import { resolveDeaths } from './deaths';
import { DEFENDERS } from '../content/defenders';
import { PATHOGENS } from '../content/pathogens';
import {
  IMMUNITY_MAX,
  SPLIT_BACK_OFFSET,
  SPLIT_BACK_SPACING,
  SPLIT_COUNT,
  SPLIT_HP_FRACTION,
} from '../content/rules';
import { positionAt } from '../path';
import { addEnemy, addTower, simFor } from '../testing';

describe('resolveDeaths', () => {
  it('removes anything at or below zero health and leaves the living alone', () => {
    const state = simFor();
    addEnemy(state, 'staph', { hp: 0 });
    const survivor = addEnemy(state, 'staph', { hp: PATHOGENS.staph.hp / 2 });

    resolveDeaths(state, new Set());

    expect(state.enemies).toEqual([survivor]);
  });

  it('reports what it killed back to the caller', () => {
    const state = simFor();
    const killed = addEnemy(state, 'staph', { hp: 0 });
    const dead = new Set<number>();

    resolveDeaths(state, dead);

    expect(dead.has(killed.id)).toBe(true);
  });

  it('pays the kill reward and counts it', () => {
    const state = simFor();
    state.energy = 0;
    addEnemy(state, 'film', { hp: 0 });

    resolveDeaths(state, new Set());

    expect(state.energy).toBe(PATHOGENS.film.reward);
    expect(state.waveKills).toBe(1);
    expect(state.totalKills).toBe(1);
  });

  /**
   * Decision D11. A pathogen that got through is a failure, so it pays no bounty — including
   * the case that makes the rule bite: it crossed the line and the tag burn finished it on the
   * same step, so it is both at zero health and already marked as having leaked.
   */
  it('pays nothing for an enemy that leaked, even if it died on the way out — decision D11', () => {
    const state = simFor();
    state.energy = 0;
    const leaked = addEnemy(state, 'staph', { hp: 0 });

    resolveDeaths(state, new Set([leaked.id]));

    expect(state.energy).toBe(0);
    expect(state.waveKills).toBe(0);
    expect(state.totalKills).toBe(0);
    expect(state.enemies).toHaveLength(0);
  });

  it('sweeps a leaked enemy off the board while it is still at full health', () => {
    const state = simFor();
    const leaked = addEnemy(state, 'staph', { hp: PATHOGENS.staph.hp });

    resolveDeaths(state, new Set([leaked.id]));

    expect(state.enemies).toHaveLength(0);
  });

  it('teaches a memory cell standing over the kill', () => {
    const state = simFor();
    const tower = addTower(state, 'mem', 0, 0, 0);
    addEnemy(state, 'staph', { x: 0, y: 0, hp: 0 });

    resolveDeaths(state, new Set());

    expect(tower.xp).toBeCloseTo(DEFENDERS.mem.learn, 6);
  });

  it('rests a phagocyte briefly between meals', () => {
    expect(DEFENDERS.phago.streak).toBeGreaterThan(1);

    const state = simFor();
    const tower = addTower(state, 'phago', 0, 0, 0);
    const prey = addEnemy(state, 'staph', { hp: 0 });
    tower.holdingEnemyId = prey.id;

    resolveDeaths(state, new Set());

    expect(tower.holdingEnemyId).toBeNull();
    expect(tower.eaten).toBe(1);
    expect(tower.rest).toBe(DEFENDERS.phago.gap);
  });

  it('rests a phagocyte for the long rest on every streak-th meal', () => {
    // The two rests must be distinguishable for the streak to be a mechanic at all.
    expect(DEFENDERS.phago.rest).not.toBe(DEFENDERS.phago.gap);

    const state = simFor();
    const tower = addTower(state, 'phago', 0, 0, 0);
    tower.eaten = DEFENDERS.phago.streak - 1;
    const prey = addEnemy(state, 'staph', { hp: 0 });
    tower.holdingEnemyId = prey.id;

    resolveDeaths(state, new Set());

    expect(tower.eaten).toBe(DEFENDERS.phago.streak);
    expect(tower.rest).toBe(DEFENDERS.phago.rest);
  });

  it('leaves a phagocyte holding a meal that is still alive', () => {
    const state = simFor();
    const tower = addTower(state, 'phago', 0, 0, 0);
    const meal = addEnemy(state, 'staph', { hp: PATHOGENS.staph.hp / 2 });
    tower.holdingEnemyId = meal.id;
    addEnemy(state, 'staph', { hp: 0 });

    resolveDeaths(state, new Set());

    expect(tower.holdingEnemyId).toBe(meal.id);
    expect(tower.eaten).toBe(0);
    expect(tower.rest).toBe(0);
  });

  it('does nothing at all when nothing died', () => {
    const state = simFor();
    state.energy = 0;
    const alive = addEnemy(state, 'staph', { hp: PATHOGENS.staph.hp });

    resolveDeaths(state, new Set());

    expect(state.enemies).toEqual([alive]);
    expect(state.energy).toBe(0);
    expect(state.waveKills).toBe(0);
  });
});

/**
 * Far enough along the vessel that even the last child lands ahead of the start, so the spacing
 * assertions measure spacing rather than the clamp. Its own test covers the clamp.
 */
const CLEAR_OF_START = 2 * (SPLIT_BACK_OFFSET + SPLIT_COUNT * SPLIT_BACK_SPACING);

describe('flu virus — splits on death', () => {
  it('leaves weaker children strung out behind where it fell', () => {
    expect(PATHOGENS.virus.splits).toBe(true);
    expect(SPLIT_HP_FRACTION).toBeLessThan(1);
    expect(SPLIT_BACK_OFFSET).toBeGreaterThan(0);
    expect(SPLIT_BACK_SPACING).toBeGreaterThan(0);

    const state = simFor('throat');
    const parent = addEnemy(state, 'virus', { hp: 0, distance: CLEAR_OF_START });

    resolveDeaths(state, new Set());

    expect(state.enemies).toHaveLength(SPLIT_COUNT);
    state.enemies.forEach((child, n) => {
      expect(child.kind).toBe(parent.kind);
      expect(child.generation).toBe(1);
      expect(child.maxHp).toBe(PATHOGENS.virus.hp * SPLIT_HP_FRACTION);
      expect(child.hp).toBe(child.maxHp);
      expect(child.maxHp).toBeLessThan(parent.maxHp);
      expect(child.distance).toBeCloseTo(
        parent.distance - SPLIT_BACK_OFFSET - n * SPLIT_BACK_SPACING,
        6,
      );
      expect(child.distance).toBeLessThan(parent.distance);
    });
  });

  it('spaces each child further back than the one before it', () => {
    expect(SPLIT_COUNT).toBeGreaterThan(1);
    expect(SPLIT_BACK_SPACING).toBeGreaterThan(0);

    const state = simFor('throat');
    addEnemy(state, 'virus', { hp: 0, distance: CLEAR_OF_START });

    resolveDeaths(state, new Set());

    const distances = state.enemies.map((child) => child.distance);
    const descending = [...distances].sort((a, b) => b - a);
    expect(distances).toEqual(descending);
    expect(new Set(distances).size).toBe(SPLIT_COUNT);
  });

  it('places each child on the vessel, ready to be drawn on the frame it appears', () => {
    const state = simFor('throat');
    addEnemy(state, 'virus', { hp: 0, distance: CLEAR_OF_START });

    resolveDeaths(state, new Set());

    for (const child of state.enemies) {
      expect([child.x, child.y]).toEqual(positionAt(state.path, child.distance));
    }
  });

  it('gives every child an id of its own', () => {
    const state = simFor('throat');
    addEnemy(state, 'virus', { hp: 0, distance: CLEAR_OF_START });

    resolveDeaths(state, new Set());

    const ids = state.enemies.map((child) => child.id);
    expect(new Set(ids).size).toBe(SPLIT_COUNT);
    expect(state.nextEnemyId).toBeGreaterThan(Math.max(...ids));
  });

  it('never lets a child split again', () => {
    const state = simFor('throat');
    addEnemy(state, 'virus', { hp: 0, distance: CLEAR_OF_START, generation: 1 });

    resolveDeaths(state, new Set());

    expect(state.enemies).toHaveLength(0);
  });

  it('clamps a child to the start of the vessel rather than behind it', () => {
    const state = simFor('throat');
    addEnemy(state, 'virus', { hp: 0, distance: 0 });

    resolveDeaths(state, new Set());

    expect(state.enemies.map((child) => child.distance))
      .toEqual(Array.from({ length: SPLIT_COUNT }, () => 0));
  });

  it('stops splitting entirely once the flu vaccine is complete', () => {
    const state = simFor('throat', { immunity: { virus: IMMUNITY_MAX } });
    addEnemy(state, 'virus', { hp: 0, distance: CLEAR_OF_START });

    resolveDeaths(state, new Set());

    expect(state.enemies).toHaveLength(0);
  });

  it('still splits while the flu vaccine is one clear short', () => {
    const state = simFor('throat', { immunity: { virus: IMMUNITY_MAX - 1 } });
    addEnemy(state, 'virus', { hp: 0, distance: CLEAR_OF_START });

    resolveDeaths(state, new Set());

    expect(state.enemies).toHaveLength(SPLIT_COUNT);
  });

  it('splits wherever a virus dies, not only in the virus case', () => {
    const state = simFor('forearm');
    addEnemy(state, 'virus', { hp: 0, distance: CLEAR_OF_START });

    resolveDeaths(state, new Set());

    expect(state.enemies).toHaveLength(SPLIT_COUNT);
  });

  it('does not split anything that is not a splitter', () => {
    expect(PATHOGENS.spore.splits).toBeUndefined();

    const state = simFor('throat');
    addEnemy(state, 'spore', { hp: 0, distance: CLEAR_OF_START });

    resolveDeaths(state, new Set());

    expect(state.enemies).toHaveLength(0);
  });

  it('pays for the parent only, never for the children it left behind', () => {
    const state = simFor('throat');
    state.energy = 0;
    addEnemy(state, 'virus', { hp: 0, distance: CLEAR_OF_START });

    resolveDeaths(state, new Set());

    expect(state.energy).toBe(PATHOGENS.virus.reward);
    expect(state.waveKills).toBe(1);
    expect(state.totalKills).toBe(1);
  });

  it('leaves no children behind a virus that leaked — decision D11', () => {
    const state = simFor('throat');
    const leaked = addEnemy(state, 'virus', { hp: 0, distance: CLEAR_OF_START });

    resolveDeaths(state, new Set([leaked.id]));

    expect(state.enemies).toHaveLength(0);
  });
});

describe('memory cells learn from nearby kills', () => {
  it('learns from a kill at the very edge of its reach', () => {
    const state = simFor();
    const tower = addTower(state, 'mem', 0, 0, 0);
    addEnemy(state, 'staph', { hp: 0, x: DEFENDERS.mem.range, y: 0 });

    resolveDeaths(state, new Set());

    expect(tower.xp).toBeCloseTo(DEFENDERS.mem.learn, 6);
  });

  it('learns nothing from a kill outside its reach', () => {
    const state = simFor();
    const tower = addTower(state, 'mem', 0, 0, 0);
    addEnemy(state, 'staph', { hp: 0, x: DEFENDERS.mem.range + 1, y: 0 });

    resolveDeaths(state, new Set());

    expect(tower.xp).toBe(0);
  });

  it('keeps what it learned across kills', () => {
    expect(DEFENDERS.mem.learn).toBeGreaterThan(0);

    const state = simFor();
    const tower = addTower(state, 'mem', 0, 0, 0);
    addEnemy(state, 'staph', { hp: 0, x: 0, y: 0 });
    resolveDeaths(state, new Set());

    addEnemy(state, 'staph', { hp: 0, x: 0, y: 0 });
    resolveDeaths(state, new Set());

    expect(tower.xp).toBeCloseTo(2 * DEFENDERS.mem.learn, 6);
  });

  it('stops at its ceiling and keeps everything it had', () => {
    expect(DEFENDERS.mem.learn).toBeGreaterThan(0);

    const state = simFor();
    const tower = addTower(state, 'mem', 0, 0, 0);
    tower.xp = DEFENDERS.mem.cap - DEFENDERS.mem.learn / 2;
    addEnemy(state, 'staph', { hp: 0, x: 0, y: 0 });

    resolveDeaths(state, new Set());

    expect(tower.xp).toBe(DEFENDERS.mem.cap);
  });
});
