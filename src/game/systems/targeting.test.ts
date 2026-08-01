import { describe, expect, it } from 'vitest';
import { armourMultiplier, inRange, isAlive, isTagged, pickLeader, pickMostWounded } from './targeting';
import { PATHOGENS } from '../content/pathogens';
import { IMMUNITY_MAX } from '../content/rules';
import { createSimState } from '../state';
import type { Enemy, PathogenKind, SimState, StrainId, Tower } from '../types';

function stateWith(immunity: Partial<Record<StrainId, number>> = {}): SimState {
  return createSimState({
    caseId: 'forearm',
    immunity: { staph: 0, film: 0, virus: 0, ...immunity },
    day: 1,
    totalKills: 0,
  });
}

function enemyOf(kind: PathogenKind, overrides: Partial<Enemy> = {}): Enemy {
  const stats = PATHOGENS[kind];
  return {
    id: 1, kind, distance: 0, x: 0, y: 0,
    hp: stats.hp, maxHp: stats.hp, tag: 0, generation: 0,
    ...overrides,
  };
}

const tower: Tower = { kind: 'clot', spotIndex: 0, x: 0, y: 0, hp: 100, stun: 0, matured: false };

/** The armoured and untaggable pathogens the tests below reason about, read off the table. */
const ARMOURED = (Object.keys(PATHOGENS) as PathogenKind[]).filter(
  (kind) => PATHOGENS[kind].armour !== undefined,
);

describe('isTagged', () => {
  it('is true only while tag time remains', () => {
    expect(isTagged(enemyOf('staph', { tag: 0.1 }))).toBe(true);
    expect(isTagged(enemyOf('staph', { tag: 0 }))).toBe(false);
    expect(isTagged(enemyOf('staph', { tag: -1 }))).toBe(false);
  });
});

describe('armourMultiplier', () => {
  it('is 1 for a pathogen with no armour', () => {
    for (const kind of Object.keys(PATHOGENS) as PathogenKind[]) {
      if (PATHOGENS[kind].armour !== undefined) continue;
      expect(armourMultiplier(stateWith(), enemyOf(kind))).toBe(1);
    }
  });

  it('reduces incoming damage for every armoured pathogen while untagged', () => {
    expect(ARMOURED.length).toBeGreaterThan(0);
    for (const kind of ARMOURED) {
      expect(armourMultiplier(stateWith(), enemyOf(kind))).toBe(PATHOGENS[kind].armour);
      expect(armourMultiplier(stateWith(), enemyOf(kind))).toBeLessThan(1);
    }
  });

  it('strips armour from a taggable pathogen while it is tagged', () => {
    for (const kind of ARMOURED) {
      if (PATHOGENS[kind].noTag === true) continue;
      expect(armourMultiplier(stateWith(), enemyOf(kind, { tag: 1 }))).toBe(1);
    }
  });

  it('keeps armour on an untaggable pathogen even if a tag timer is somehow set', () => {
    for (const kind of ARMOURED) {
      if (PATHOGENS[kind].noTag !== true) continue;
      expect(armourMultiplier(stateWith(), enemyOf(kind, { tag: 1 }))).toBe(PATHOGENS[kind].armour);
    }
  });

  it('strips biofilm armour permanently once the serum is held — decision D22', () => {
    expect(armourMultiplier(stateWith({ film: IMMUNITY_MAX }), enemyOf('film'))).toBe(1);
    expect(armourMultiplier(stateWith({ film: IMMUNITY_MAX - 1 }), enemyOf('film'))).toBe(PATHOGENS.film.armour);
  });

  it('does not let the biofilm serum touch resistant armour', () => {
    expect(armourMultiplier(stateWith({ film: IMMUNITY_MAX }), enemyOf('mrsa'))).toBe(PATHOGENS.mrsa.armour);
  });
});

describe('inRange', () => {
  it('includes the boundary and excludes anything past it', () => {
    expect(inRange(tower, enemyOf('staph', { x: 10, y: 0 }), 10)).toBe(true);
    expect(inRange(tower, enemyOf('staph', { x: 10.001, y: 0 }), 10)).toBe(false);
  });
});

describe('isAlive', () => {
  it('excludes anything at zero health or already marked dead', () => {
    expect(isAlive(enemyOf('staph'), new Set())).toBe(true);
    expect(isAlive(enemyOf('staph', { hp: 0 }), new Set())).toBe(false);
    expect(isAlive(enemyOf('staph', { id: 7 }), new Set([7]))).toBe(false);
  });
});

describe('pickLeader', () => {
  it('picks the enemy furthest along the vessel', () => {
    const state = stateWith();
    state.enemies = [
      enemyOf('staph', { id: 1, distance: 10 }),
      enemyOf('staph', { id: 2, distance: 40 }),
      enemyOf('staph', { id: 3, distance: 25 }),
    ];
    expect(pickLeader(state, tower, 100, new Set())?.id).toBe(2);
  });

  it('ignores anything out of range, dead or excluded', () => {
    const state = stateWith();
    state.enemies = [enemyOf('staph', { id: 1, distance: 40, x: 500 })];
    expect(pickLeader(state, tower, 100, new Set())).toBeNull();

    state.enemies = [enemyOf('staph', { id: 1, distance: 40 })];
    expect(pickLeader(state, tower, 100, new Set([1]))).toBeNull();
    expect(pickLeader(state, tower, 100, new Set(), new Set([1]))).toBeNull();
  });
});

describe('pickMostWounded', () => {
  it('picks the lowest health fraction rather than the lowest health', () => {
    const state = stateWith();
    const tough = enemyOf('film', { id: 1 });
    const frail = enemyOf('staph', { id: 2 });
    tough.hp = tough.maxHp * 0.2;
    frail.hp = frail.maxHp * 0.9;
    state.enemies = [frail, tough];
    expect(pickMostWounded(state, tower, 100, new Set())?.id).toBe(tough.id);
  });

  it('returns null when nothing is in range', () => {
    const state = stateWith();
    state.enemies = [enemyOf('staph', { x: 900 })];
    expect(pickMostWounded(state, tower, 10, new Set())).toBeNull();
  });
});
