import { describe, expect, it } from 'vitest';
import { applySpawn, buildQueue } from './spawn';
import { createSimState } from '../state';
import { CASE_BY_ID } from '../content/cases';
import { PATHOGENS } from '../content/pathogens';
import { IMMUNITY_MAX, SPAWN_FIRST_DELAY } from '../content/rules';
import { createRng, waveSeed } from '../rng';
import type { CaseId, PathogenKind, SimState, StrainId } from '../types';

function waveSize(state: SimState): number {
  const wave = CASE_BY_ID[state.caseId].waves[state.waveIndex] ?? [];
  return wave.reduce((sum, entry) => sum + entry.count, 0);
}

function armed(caseId: CaseId, immunity: Partial<Record<StrainId, number>> = {}): SimState {
  const state = createSimState({
    caseId,
    immunity: { staph: 0, film: 0, virus: 0, ...immunity },
    day: 1,
    totalKills: 0,
  });
  state.phase = 'wave';
  state.queue = buildQueue(state);
  state.spawnTimer = SPAWN_FIRST_DELAY;
  return state;
}

/** The wound case is the only one the tetanus shield applies to. */
function wounded(immunity: Partial<Record<StrainId, number>> = {}): SimState {
  return armed('forearm', immunity);
}

/**
 * A wound case with the shield earned and a queue of nothing but staph, so the bounce tests
 * do not depend on what the wave table happens to open with.
 */
function shielded(immunity: Partial<Record<StrainId, number>> = { staph: IMMUNITY_MAX }): SimState {
  const state = armed('forearm', immunity);
  state.queue = ['staph', 'staph'];
  return state;
}

/** The first wound wave that mixes kinds. A wave of one kind cannot show a shuffle at all. */
const MIXED_WAVE = CASE_BY_ID.forearm.waves
  .findIndex((wave) => new Set(wave.map((entry) => entry.kind)).size > 1);

/** The wave table expanded in table order and left unshuffled — what a missing shuffle produces. */
function grouped(caseId: CaseId, waveIndex: number): readonly PathogenKind[] {
  return (CASE_BY_ID[caseId].waves[waveIndex] ?? [])
    .flatMap((entry) => Array.from({ length: entry.count }, () => entry.kind));
}

/** Where mulberry32 sits after `draws` numbers have been taken from `seed`. */
function advanced(seed: number, draws: number): number {
  const rng = createRng(seed);
  for (let i = 0; i < draws; i += 1) rng.next();
  return rng.state;
}

function drain(state: SimState): void {
  state.spawnTimer = 0;
  applySpawn(state, SPAWN_FIRST_DELAY);
}

describe('buildQueue', () => {
  it('expands the wave table into one queue entry per pathogen', () => {
    const state = wounded();
    expect(state.queue).toHaveLength(waveSize(state));
  });

  it('produces exactly the counts the wave table asks for', () => {
    const state = wounded();
    state.waveIndex = 3;
    const queue = buildQueue(state);
    for (const entry of CASE_BY_ID.forearm.waves[3] ?? []) {
      expect(queue.filter((kind) => kind === entry.kind)).toHaveLength(entry.count);
    }
  });

  it('is identical for the same case and wave', () => {
    expect(wounded().queue).toEqual(wounded().queue);
  });

  it('has a wound wave that mixes kinds, or the two cases below are vacuous', () => {
    expect(MIXED_WAVE).toBeGreaterThanOrEqual(0);
    expect(CASE_BY_ID.forearm.waves.length).toBeGreaterThan(1);
  });

  /**
   * The previous version asserted the queue differed from its own alphabetically sorted copy.
   * An unshuffled queue is already in wave-table order, which is not alphabetical order, so that
   * assertion held with the shuffle deleted. The falsifier is the grouped expansion itself.
   */
  it('shuffles a mixed wave rather than leaving it grouped by kind', () => {
    const state = wounded();
    state.waveIndex = MIXED_WAVE;
    const queue = buildQueue(state);
    const inTableOrder = grouped('forearm', MIXED_WAVE);

    expect(queue).toHaveLength(waveSize(state));
    expect([...queue].sort()).toEqual([...inTableOrder].sort());
    expect(queue).not.toEqual(inTableOrder);
  });

  /**
   * Comparing two waves' queues cannot show this: waves of different composition differ whatever
   * the seed does, which is what made the previous version of this test unfalsifiable. What
   * isolates the seed is where the generator ends up — advance a rival wave's seed by the same
   * number of draws, and it can only land in the same place if both waves were seeded alike.
   */
  it('shuffles each wave from its own seed rather than one seed per case', () => {
    const other = (MIXED_WAVE + 1) % CASE_BY_ID.forearm.waves.length;
    expect(other).not.toBe(MIXED_WAVE);

    const state = wounded();
    state.waveIndex = MIXED_WAVE;
    const draws = buildQueue(state).length - 1;

    expect(state.rngState).toBe(advanced(waveSeed('forearm', MIXED_WAVE), draws));
    expect(state.rngState).not.toBe(advanced(waveSeed('forearm', other), draws));
  });

  it('records the generator state so the run stays serialisable', () => {
    expect(wounded().rngState).toBeGreaterThan(0);
  });
});

describe('applySpawn', () => {
  it('spawns nothing until the first delay elapses', () => {
    const state = wounded();
    applySpawn(state, SPAWN_FIRST_DELAY / 2);
    expect(state.enemies).toHaveLength(0);
  });

  it('spawns one enemy at the head of the path at its full health', () => {
    const state = wounded();
    applySpawn(state, SPAWN_FIRST_DELAY);
    expect(state.enemies).toHaveLength(1);
    const [spawned] = state.enemies;
    expect(spawned).toBeDefined();
    if (spawned === undefined) return;
    expect(spawned.distance).toBe(0);
    expect(spawned.hp).toBe(PATHOGENS[spawned.kind].hp);
    expect(spawned.maxHp).toBe(spawned.hp);
    expect(spawned.generation).toBe(0);
  });

  it('takes one entry off the queue per spawn', () => {
    const state = wounded();
    const before = state.queue.length;
    applySpawn(state, SPAWN_FIRST_DELAY);
    expect(state.queue).toHaveLength(before - 1);
  });

  it('gives every spawned enemy a distinct id', () => {
    const state = wounded();
    for (let i = 0; i < 4; i += 1) drain(state);
    expect(new Set(state.enemies.map((enemy) => enemy.id)).size).toBe(state.enemies.length);
  });

  it('shortens the interval on later waves', () => {
    const early = wounded();
    applySpawn(early, SPAWN_FIRST_DELAY);

    const late = wounded();
    late.waveIndex = CASE_BY_ID.forearm.waves.length - 1;
    late.queue = buildQueue(late);
    late.spawnTimer = SPAWN_FIRST_DELAY;
    applySpawn(late, SPAWN_FIRST_DELAY);

    expect(late.spawnTimer).toBeLessThan(early.spawnTimer);
  });

  it('does nothing once the queue is empty', () => {
    const state = wounded();
    state.queue = [];
    applySpawn(state, SPAWN_FIRST_DELAY);
    expect(state.enemies).toHaveLength(0);
  });

  it('bounces the first staph of a wave once tetanus immunity is complete', () => {
    const state = shielded();
    drain(state);
    expect(state.enemies).toHaveLength(0);
    expect(state.shieldedWave).toBe(0);

    drain(state);
    expect(state.enemies).toHaveLength(1);
  });

  it('bounces again on the next wave', () => {
    const state = shielded();
    drain(state);
    state.waveIndex = 1;
    drain(state);
    expect(state.enemies).toHaveLength(0);
    expect(state.shieldedWave).toBe(1);
  });

  it('does not bounce below full staph immunity', () => {
    const state = shielded({ staph: IMMUNITY_MAX - 1 });
    drain(state);
    expect(state.enemies).toHaveLength(1);
  });

  it('bounces only staph, never another pathogen', () => {
    const state = shielded();
    state.queue = ['film', 'staph'];
    drain(state);
    expect(state.enemies).toHaveLength(1);
    expect(state.shieldedWave).toBeNull();
  });

  it('does not bounce outside a wound case', () => {
    const state = armed('stomach', { staph: IMMUNITY_MAX });
    state.queue = ['staph'];
    drain(state);
    expect(state.enemies).toHaveLength(1);
  });

  /**
   * Decision D2. The prototype spent the shield against an instance field that survived
   * `startCase`, so a replay of the same case lost the bounce entirely.
   */
  it('restores the shield when the case is replayed — decision D2', () => {
    const first = shielded();
    drain(first);
    expect(first.enemies).toHaveLength(0);

    const replay = shielded();
    drain(replay);
    expect(replay.enemies).toHaveLength(0);
    expect(replay.shieldedWave).toBe(0);
  });
});
