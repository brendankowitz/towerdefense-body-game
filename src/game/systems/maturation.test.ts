import { describe, expect, it } from 'vitest';
import { acquireHolds, runDefenders } from './damage';
import { resolveDeaths } from './deaths';
import { applyMovement } from './movement';
import { statsFor } from './stats';
import { hashState } from '../hash';
import { DEFENDERS } from '../content/defenders';
import { maturedFormOf } from '../content/maturation';
import { PATHOGENS } from '../content/pathogens';
import { STEP_SECONDS, TOWER_MAX_HP } from '../content/rules';
import { addEnemy, addTower, addTowerOnPath, simFor } from '../testing';
import type { DefenderKind, SimState } from '../types';

/**
 * A grown cell has to fight differently, not just cost differently. Each case here runs the
 * same board twice — once as placed, once matured — and asserts the simulation moved by the
 * ratio content asked for. No magnitude is written down: change the numbers and these still
 * hold; stop honouring an override and they fail.
 */

/** Mirrors `step`'s two defender passes: acquisition first, then the action pass. */
function tick(state: SimState, dt: number): void {
  const held = new Set<number>();
  for (const tower of state.towers) {
    if (tower.kind === 'phago' && tower.holdingEnemyId !== null) held.add(tower.holdingEnemyId);
  }
  acquireHolds(state, held, new Set());
  runDefenders(state, dt, new Set());
}

/**
 * The value a kind's matured form gives a stat. Throws rather than skipping: an override that
 * quietly disappears would leave the case below passing while testing nothing.
 */
function override(kind: DefenderKind, field: string): number {
  const stats: Record<string, unknown> = { ...(maturedFormOf(kind)?.stats ?? {}) };
  const value = stats[field];
  if (typeof value !== 'number') {
    throw new Error(`${kind}'s matured form no longer moves ${field}; this test needs rewriting`);
  }
  return value;
}

describe('macrophage — a matured phagocyte', () => {
  it('bites harder, in proportion to the digest rate it was given', () => {
    const plain = simFor();
    addTower(plain, 'phago', 0, 0, 0);
    const plainPrey = addEnemy(plain, 'staph', { x: 10, y: 0 });

    const grown = simFor();
    addTower(grown, 'phago', 0, 0, 0, true);
    const grownPrey = addEnemy(grown, 'staph', { x: 10, y: 0 });

    tick(plain, STEP_SECONDS);
    tick(grown, STEP_SECONDS);

    const plainBite = PATHOGENS.staph.hp - plainPrey.hp;
    const grownBite = PATHOGENS.staph.hp - grownPrey.hp;

    expect(plainBite).toBeGreaterThan(0);
    expect(grownBite).toBeGreaterThan(plainBite);
    expect(grownBite / plainBite).toBeCloseTo(override('phago', 'dps') / DEFENDERS.phago.dps, 6);
  });

  it('reaches prey the cell it grew from cannot touch', () => {
    const reach = DEFENDERS.phago.range;
    const grownReach = override('phago', 'range');
    expect(grownReach).toBeGreaterThan(reach);
    const between = (reach + grownReach) / 2;

    const plain = simFor();
    const plainCell = addTower(plain, 'phago', 0, 0, 0);
    addEnemy(plain, 'staph', { x: between, y: 0 });

    const grown = simFor();
    const grownCell = addTower(grown, 'phago', 0, 0, 0, true);
    const prey = addEnemy(grown, 'staph', { x: between, y: 0 });

    acquireHolds(plain, new Set(), new Set());
    acquireHolds(grown, new Set(), new Set());

    expect(plainCell.holdingEnemyId).toBeNull();
    expect(grownCell.holdingEnemyId).toBe(prey.id);
  });

  it('is slower to come back once it is full, which is what it trades for the bite', () => {
    function restWhenFull(matured: boolean): number {
      const state = simFor();
      const cell = addTower(state, 'phago', 0, 0, 0, matured);
      const prey = addEnemy(state, 'staph', { x: 10, y: 0, hp: 0 });

      cell.digested = statsFor(cell).capacity;
      cell.holdingEnemyId = prey.id;
      resolveDeaths(state, new Set());
      return cell.rest;
    }

    const plainRest = restWhenFull(false);
    const grownRest = restWhenFull(true);

    expect(plainRest).toBe(DEFENDERS.phago.rest);
    expect(grownRest).toBe(override('phago', 'rest'));
    expect(grownRest).toBeGreaterThan(plainRest);
  });

  /**
   * The reason to grow one. Both cells are given the same load — everything the base can hold —
   * and only the base has to stop for it. Written as one load rather than two capacities so it
   * asserts the consequence a player feels, not the ratio the table happens to carry.
   */
  it('has room for a load that fills the cell it grew from', () => {
    function restAfterLoad(matured: boolean): number {
      const state = simFor();
      const cell = addTower(state, 'phago', 0, 0, 0, matured);
      const prey = addEnemy(state, 'staph', { x: 10, y: 0, hp: 0 });

      cell.digested = DEFENDERS.phago.capacity;
      cell.holdingEnemyId = prey.id;
      resolveDeaths(state, new Set());
      return cell.rest;
    }

    expect(override('phago', 'capacity')).toBeGreaterThan(DEFENDERS.phago.capacity);
    expect(restAfterLoad(false)).toBe(DEFENDERS.phago.rest);
    expect(restAfterLoad(true)).toBe(DEFENDERS.phago.gap);
  });
});

describe('fibrin mesh — a matured clot', () => {
  function crawl(matured: boolean): { readonly advanced: number; readonly worn: number } {
    const state = simFor();
    const clot = addTowerOnPath(state, 'clot', 0, matured);
    const enemy = addEnemy(state, 'staph', { distance: 0 });

    applyMovement(state, STEP_SECONDS, new Set(), new Set());
    return { advanced: enemy.distance, worn: TOWER_MAX_HP - clot.hp };
  }

  it('holds everything harder, in proportion to the slow it was given', () => {
    const plain = crawl(false);
    const grown = crawl(true);

    expect(plain.advanced).toBeGreaterThan(0);
    expect(grown.advanced).toBeLessThan(plain.advanced);
    expect(grown.advanced / plain.advanced)
      .toBeCloseTo(override('clot', 'slow') / DEFENDERS.clot.slow, 6);
  });

  it('is worn down faster for it, in proportion to the wear it was given', () => {
    const plain = crawl(false);
    const grown = crawl(true);

    expect(plain.worn).toBeGreaterThan(0);
    expect(grown.worn).toBeGreaterThan(plain.worn);
    expect(grown.worn / plain.worn).toBeCloseTo(override('clot', 'wear') / DEFENDERS.clot.wear, 6);
  });
});

describe('high-affinity antibody — a matured antibody', () => {
  it('lays a mark that lasts as long as the form says, and longer than the base one', () => {
    function markFor(matured: boolean): number {
      const state = simFor();
      addTower(state, 'anti', 0, 0, 0, matured);
      const enemy = addEnemy(state, 'staph', { x: 10, y: 0 });
      tick(state, STEP_SECONDS);
      return enemy.tag;
    }

    expect(markFor(false)).toBe(DEFENDERS.anti.tag);
    expect(markFor(true)).toBe(override('anti', 'tag'));
    expect(markFor(true)).toBeGreaterThan(markFor(false));
  });

  it('waits longer before it can mark again', () => {
    function cooldownFor(matured: boolean): number {
      const state = simFor();
      const cell = addTower(state, 'anti', 0, 0, 0, matured);
      addEnemy(state, 'staph', { x: 10, y: 0 });
      tick(state, STEP_SECONDS);
      return cell.cooldown;
    }

    expect(cooldownFor(false)).toBe(DEFENDERS.anti.rate);
    expect(cooldownFor(true)).toBe(override('anti', 'rate'));
    expect(cooldownFor(true)).toBeGreaterThan(cooldownFor(false));
  });

  /**
   * The defect this form was rebuilt around. Reach used to be what it paid with, and reach is the
   * one stat the geometry cannot absorb — the grown cell stood on build spots it could no longer
   * mark anything from at all. `content.invariants.test.ts` states that as a rule over the real
   * board geometry; this is the same rule as behaviour, at the base form's own edge, so it holds
   * whatever either range becomes.
   */
  it('marks everything the cell it grew from could reach, so growing never costs it a spot', () => {
    function marksAt(matured: boolean, x: number): boolean {
      const state = simFor();
      addTower(state, 'anti', 0, 0, 0, matured);
      const target = addEnemy(state, 'staph', { x, y: 0 });
      tick(state, STEP_SECONDS);
      return target.tag > 0;
    }

    const SAMPLES = 10;
    let reached = 0;
    for (let sample = 1; sample <= SAMPLES; sample += 1) {
      const x = (DEFENDERS.anti.range * sample) / SAMPLES;
      if (!marksAt(false, x)) continue;
      reached += 1;
      expect(
        marksAt(true, x),
        `a grown antibody cannot mark at ${x.toFixed(1)}, and the cell it grew from can`,
      ).toBe(true);
    }
    expect(reached, 'the base antibody marked nothing anywhere, so this asserted nothing').toBe(SAMPLES);
  });
});

describe('the run hash', () => {
  it('tells a grown cell apart from the cell it grew from', () => {
    const plain = simFor();
    addTower(plain, 'phago', 0, 0, 0);

    const grown = simFor();
    addTower(grown, 'phago', 0, 0, 0, true);

    expect(hashState(grown)).not.toBe(hashState(plain));
  });
});
