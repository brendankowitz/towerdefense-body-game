import { describe, expect, it } from 'vitest';
import { acquireHolds, runDefenders } from './damage';
import { armourMultiplier } from './targeting';
import { DEFENDERS } from '../content/defenders';
import { PATHOGENS } from '../content/pathogens';
import { IMMUNITY_MAX, STEP_SECONDS } from '../content/rules';
import { addEnemy, addTower, simFor } from '../testing';
import type { SimState } from '../types';

/** Mirrors `step`'s two defender passes: acquisition first, then the action pass. */
function tick(state: SimState, dt: number, dead = new Set<number>()): void {
  const held = new Set<number>();
  for (const tower of state.towers) {
    if (tower.kind === 'phago' && tower.holdingEnemyId !== null) held.add(tower.holdingEnemyId);
  }
  acquireHolds(state, held, dead);
  runDefenders(state, dt, dead);
}

describe('phagocyte — engulf', () => {
  it('grabs the enemy furthest along the vessel in range, before movement runs', () => {
    const state = simFor();
    const tower = addTower(state, 'phago', 0, 0, 0);
    addEnemy(state, 'staph', { x: 10, y: 0, distance: 5 });
    const leader = addEnemy(state, 'staph', { x: 20, y: 0, distance: 40 });

    const held = new Set<number>();
    acquireHolds(state, held, new Set());

    expect(tower.holdingEnemyId).toBe(leader.id);
    expect(held.has(leader.id)).toBe(true);
  });

  it('ignores anything outside its reach', () => {
    const state = simFor();
    const tower = addTower(state, 'phago', 0, 0, 0);
    addEnemy(state, 'staph', { x: DEFENDERS.phago.range + 1, y: 0 });

    acquireHolds(state, new Set(), new Set());

    expect(tower.holdingEnemyId).toBeNull();
  });

  it('digests at its digest rate into whatever it is holding', () => {
    const state = simFor();
    addTower(state, 'phago', 0, 0, 0);
    const prey = addEnemy(state, 'staph', { x: 10, y: 0 });

    tick(state, 1);

    expect(prey.hp).toBeCloseTo(PATHOGENS.staph.hp - DEFENDERS.phago.dps, 6);
  });

  it('digests an armoured target at its armour-reduced rate', () => {
    const armour = PATHOGENS.film.armour ?? 1;
    expect(armour).toBeLessThan(1);

    const state = simFor();
    addTower(state, 'phago', 0, 0, 0);
    const prey = addEnemy(state, 'film', { x: 10, y: 0 });

    tick(state, 1);

    expect(prey.hp).toBeCloseTo(PATHOGENS.film.hp - DEFENDERS.phago.dps * armour, 6);
  });

  it('bites a biofilm strictly harder once the serum is held — decision D22', () => {
    expect(PATHOGENS.film.armour ?? 1).toBeLessThan(1);

    const immune = simFor('forearm', { immunity: { film: IMMUNITY_MAX } });
    addTower(immune, 'phago', 0, 0, 0);
    const immunePrey = addEnemy(immune, 'film', { x: 10, y: 0 });

    const raw = simFor();
    addTower(raw, 'phago', 0, 0, 0);
    const rawPrey = addEnemy(raw, 'film', { x: 10, y: 0 });

    tick(immune, 1);
    tick(raw, 1);

    expect(immunePrey.hp).toBeCloseTo(PATHOGENS.film.hp - DEFENDERS.phago.dps, 6);
    expect(PATHOGENS.film.hp - immunePrey.hp).toBeGreaterThan(PATHOGENS.film.hp - rawPrey.hp);
  });

  it('holds one target at a time and never steals another phagocyte’s meal', () => {
    const state = simFor();
    const first = addTower(state, 'phago', 0, 0, 0);
    const second = addTower(state, 'phago', 1, 10, 0);
    addEnemy(state, 'staph', { x: 5, y: 0, distance: 30 });
    addEnemy(state, 'staph', { x: 6, y: 0, distance: 10 });

    acquireHolds(state, new Set(), new Set());

    expect(first.holdingEnemyId).not.toBeNull();
    expect(second.holdingEnemyId).not.toBeNull();
    expect(first.holdingEnemyId).not.toBe(second.holdingEnemyId);
  });

  it('keeps eating the meal it has while something further along walks past', () => {
    const state = simFor();
    const tower = addTower(state, 'phago', 0, 0, 0);
    const meal = addEnemy(state, 'staph', { x: 10, y: 0, distance: 5 });

    tick(state, STEP_SECONDS);
    const leader = addEnemy(state, 'staph', { x: 12, y: 0, distance: 80 });
    tick(state, 1);

    expect(tower.holdingEnemyId).toBe(meal.id);
    expect(leader.hp).toBe(leader.maxHp);
  });

  it('neither grabs nor digests while resting, and the rest ticks down in the action pass', () => {
    const state = simFor();
    const tower = addTower(state, 'phago', 0, 0, 0);
    tower.rest = 2;
    const prey = addEnemy(state, 'staph', { x: 10, y: 0 });

    tick(state, 0.5);

    expect(tower.holdingEnemyId).toBeNull();
    expect(prey.hp).toBe(prey.maxHp);
    expect(tower.rest).toBeCloseTo(1.5, 6);
  });

  it('grabs again once its rest has run out', () => {
    const state = simFor();
    const tower = addTower(state, 'phago', 0, 0, 0);
    tower.rest = DEFENDERS.phago.gap;
    addEnemy(state, 'staph', { x: 10, y: 0 });

    tick(state, DEFENDERS.phago.gap);
    expect(tower.holdingEnemyId).toBeNull();

    tick(state, STEP_SECONDS);
    expect(tower.holdingEnemyId).not.toBeNull();
  });

  it('neither grabs nor digests while stunned', () => {
    const state = simFor();
    const tower = addTower(state, 'phago', 0, 0, 0);
    tower.stun = PATHOGENS.toxin.stun ?? 1;
    const prey = addEnemy(state, 'staph', { x: 10, y: 0 });

    tick(state, 0.5);

    expect(tower.holdingEnemyId).toBeNull();
    expect(prey.hp).toBe(prey.maxHp);
    expect(tower.stun).toBeCloseTo((PATHOGENS.toxin.stun ?? 1) - 0.5, 6);
  });

  it('lets go of a hold whose prey has left the board', () => {
    const state = simFor();
    const tower = addTower(state, 'phago', 0, 0, 0);
    tower.holdingEnemyId = 4242;

    runDefenders(state, STEP_SECONDS, new Set());

    expect(tower.holdingEnemyId).toBeNull();
  });
});

describe('clot — block', () => {
  it('deals no damage at all', () => {
    const state = simFor();
    addTower(state, 'clot', 0, 0, 0);
    const enemy = addEnemy(state, 'staph', { x: 10, y: 0 });

    runDefenders(state, 5, new Set());

    expect(enemy.hp).toBe(enemy.maxHp);
    expect(state.beams).toHaveLength(0);
  });
});

describe('antibody — tag', () => {
  it('tags everything inside its reach at once and nothing beyond it', () => {
    const state = simFor();
    addTower(state, 'anti', 0, 0, 0);
    const near = addEnemy(state, 'staph', { x: 10, y: 0 });
    const edge = addEnemy(state, 'staph', { x: DEFENDERS.anti.range, y: 0 });
    const outside = addEnemy(state, 'staph', { x: DEFENDERS.anti.range + 1, y: 0 });

    runDefenders(state, STEP_SECONDS, new Set());

    expect(near.tag).toBe(DEFENDERS.anti.tag);
    expect(edge.tag).toBe(DEFENDERS.anti.tag);
    expect(outside.tag).toBe(0);
  });

  it('cannot tag a resistant strain', () => {
    expect(PATHOGENS.mrsa.noTag).toBe(true);

    const state = simFor();
    addTower(state, 'anti', 0, 0, 0);
    const mrsa = addEnemy(state, 'mrsa', { x: 10, y: 0 });
    const staph = addEnemy(state, 'staph', { x: 10, y: 0 });

    runDefenders(state, STEP_SECONDS, new Set());

    expect(mrsa.tag).toBe(0);
    expect(staph.tag).toBe(DEFENDERS.anti.tag);
  });

  it('strips the armour off a biofilm by tagging it', () => {
    const state = simFor();
    addTower(state, 'anti', 0, 0, 0);
    const film = addEnemy(state, 'film', { x: 10, y: 0 });
    expect(armourMultiplier(state, film)).toBeLessThan(1);

    runDefenders(state, STEP_SECONDS, new Set());

    expect(armourMultiplier(state, film)).toBe(1);
  });

  it('does not tag something already dying this step', () => {
    const state = simFor();
    addTower(state, 'anti', 0, 0, 0);
    const dying = addEnemy(state, 'staph', { x: 10, y: 0 });

    runDefenders(state, STEP_SECONDS, new Set([dying.id]));

    expect(dying.tag).toBe(0);
  });

  it('starts its pulse cooldown after tagging', () => {
    const state = simFor();
    const tower = addTower(state, 'anti', 0, 0, 0);
    addEnemy(state, 'staph', { x: 10, y: 0 });

    runDefenders(state, STEP_SECONDS, new Set());

    expect(tower.cooldown).toBeCloseTo(DEFENDERS.anti.rate, 6);
  });

  it('does not start its cooldown when there is nothing to tag', () => {
    const state = simFor();
    const tower = addTower(state, 'anti', 0, 0, 0);

    runDefenders(state, STEP_SECONDS, new Set());

    expect(tower.cooldown).toBeLessThanOrEqual(0);
  });

  it('waits out its cooldown before pulsing again', () => {
    const state = simFor();
    const tower = addTower(state, 'anti', 0, 0, 0);
    const enemy = addEnemy(state, 'staph', { x: 10, y: 0 });

    runDefenders(state, STEP_SECONDS, new Set());
    enemy.tag = 0;
    state.beams = [];

    runDefenders(state, tower.cooldown / 2, new Set());
    expect(enemy.tag).toBe(0);

    runDefenders(state, DEFENDERS.anti.rate, new Set());
    expect(enemy.tag).toBe(DEFENDERS.anti.tag);
  });

  it('draws a beam to each thing it tags', () => {
    const state = simFor();
    addTower(state, 'anti', 0, 0, 0);
    addEnemy(state, 'staph', { x: 10, y: 0 });
    addEnemy(state, 'staph', { x: 20, y: 0 });

    runDefenders(state, STEP_SECONDS, new Set());

    expect(state.beams).toHaveLength(2);
    expect(state.beams[0]?.source).toBe('anti');
  });
});

describe('killer cell — execute', () => {
  it('hits the most wounded thing in range, not the leader', () => {
    const state = simFor();
    addTower(state, 'nk', 0, 0, 0);
    const healthy = addEnemy(state, 'film', { x: 10, y: 0, distance: 90 });
    const woundedHp = PATHOGENS.film.hp * 0.6;
    const wounded = addEnemy(state, 'film', { x: 20, y: 0, distance: 10, hp: woundedHp });

    runDefenders(state, STEP_SECONDS, new Set());

    expect(healthy.hp).toBe(healthy.maxHp);
    expect(wounded.hp).toBeLessThan(woundedHp);
  });

  it('finishes anything already under the execute fraction, armour or not', () => {
    const state = simFor();
    addTower(state, 'nk', 0, 0, 0);
    const mrsa = addEnemy(state, 'mrsa', {
      x: 10, y: 0, hp: PATHOGENS.mrsa.hp * DEFENDERS.nk.execute * 0.5,
    });

    runDefenders(state, STEP_SECONDS, new Set());

    expect(mrsa.hp).toBe(0);
  });

  it('applies armour to a normal hit', () => {
    const armour = PATHOGENS.mrsa.armour ?? 1;
    expect(armour).toBeLessThan(1);

    const state = simFor();
    addTower(state, 'nk', 0, 0, 0);
    const mrsa = addEnemy(state, 'mrsa', { x: 10, y: 0 });

    runDefenders(state, STEP_SECONDS, new Set());

    expect(mrsa.hp).toBeCloseTo(PATHOGENS.mrsa.hp - DEFENDERS.nk.dmg * armour, 6);
  });

  it('reaches nothing outside its range', () => {
    const state = simFor();
    addTower(state, 'nk', 0, 0, 0);
    const far = addEnemy(state, 'staph', { x: DEFENDERS.nk.range + 1, y: 0 });

    runDefenders(state, STEP_SECONDS, new Set());

    expect(far.hp).toBe(far.maxHp);
    expect(state.beams).toHaveLength(0);
  });

  it('starts its cooldown after a hit and holds fire until it expires', () => {
    const state = simFor();
    const tower = addTower(state, 'nk', 0, 0, 0);
    const enemy = addEnemy(state, 'film', { x: 10, y: 0 });

    runDefenders(state, STEP_SECONDS, new Set());
    expect(tower.cooldown).toBeCloseTo(DEFENDERS.nk.rate, 6);

    const afterFirstHit = enemy.hp;
    runDefenders(state, DEFENDERS.nk.rate / 2, new Set());
    expect(enemy.hp).toBe(afterFirstHit);

    runDefenders(state, DEFENDERS.nk.rate, new Set());
    expect(enemy.hp).toBeLessThan(afterFirstHit);
  });

  it('draws a beam to what it struck', () => {
    const state = simFor();
    addTower(state, 'nk', 0, 0, 0);
    addEnemy(state, 'staph', { x: 10, y: 0 });

    runDefenders(state, STEP_SECONDS, new Set());

    expect(state.beams).toHaveLength(1);
    expect(state.beams[0]?.source).toBe('nk');
  });
});
