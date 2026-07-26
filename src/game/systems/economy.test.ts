import { describe, expect, it } from 'vitest';
import { awardKill, grantMemoryXp } from './economy';
import { DEFENDERS } from '../content/defenders';
import { PATHOGENS } from '../content/pathogens';
import { TAG_REWARD_MULTIPLIER } from '../content/rules';
import { addEnemy, addTower, simFor } from '../testing';

describe('awardKill', () => {
  it('pays the pathogen its own reward', () => {
    const state = simFor();
    state.energy = 0;
    const enemy = addEnemy(state, 'film');

    awardKill(state, enemy);

    expect(state.energy).toBe(PATHOGENS.film.reward);
  });

  it('pays more for a tagged kill than an untagged one', () => {
    const untagged = simFor();
    untagged.energy = 0;
    awardKill(untagged, addEnemy(untagged, 'film'));

    const tagged = simFor();
    tagged.energy = 0;
    awardKill(tagged, addEnemy(tagged, 'film', { tag: 1 }));

    expect(tagged.energy).toBe(Math.round(PATHOGENS.film.reward * TAG_REWARD_MULTIPLIER));
    expect(tagged.energy).toBeGreaterThan(untagged.energy);
  });

  it('counts the kill against both the wave and the run', () => {
    const state = simFor();
    const before = state.totalKills;

    awardKill(state, addEnemy(state, 'staph'));
    awardKill(state, addEnemy(state, 'staph'));

    expect(state.waveKills).toBe(2);
    expect(state.totalKills).toBe(before + 2);
  });
});

describe('grantMemoryXp', () => {
  it('teaches every memory cell within reach of the kill', () => {
    const state = simFor();
    const near = addTower(state, 'mem', 0, 0, 0);
    const alsoNear = addTower(state, 'mem', 1, DEFENDERS.mem.range, 0);
    const enemy = addEnemy(state, 'staph', { x: 0, y: 0 });

    grantMemoryXp(state, enemy);

    expect(near.xp).toBeCloseTo(DEFENDERS.mem.learn, 6);
    expect(alsoNear.xp).toBeCloseTo(DEFENDERS.mem.learn, 6);
  });

  it('teaches nothing to a memory cell out of reach', () => {
    const state = simFor();
    const far = addTower(state, 'mem', 0, DEFENDERS.mem.range + 1, 0);
    const enemy = addEnemy(state, 'staph', { x: 0, y: 0 });

    grantMemoryXp(state, enemy);

    expect(far.xp).toBe(0);
  });

  it('accumulates across kills and stops at the cap', () => {
    const state = simFor();
    const tower = addTower(state, 'mem', 0, 0, 0);
    const enemy = addEnemy(state, 'staph', { x: 0, y: 0 });

    grantMemoryXp(state, enemy);
    grantMemoryXp(state, enemy);
    expect(tower.xp).toBeCloseTo(2 * DEFENDERS.mem.learn, 6);

    const kills = Math.ceil(DEFENDERS.mem.cap / DEFENDERS.mem.learn) + 2;
    for (let i = 0; i < kills; i += 1) grantMemoryXp(state, enemy);

    expect(tower.xp).toBe(DEFENDERS.mem.cap);
  });
});
