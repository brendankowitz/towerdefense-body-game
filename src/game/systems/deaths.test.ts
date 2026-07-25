import { describe, expect, it } from 'vitest';
import { resolveDeaths } from './deaths';
import { DEFENDERS } from '../content/defenders';
import { PATHOGENS } from '../content/pathogens';
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
