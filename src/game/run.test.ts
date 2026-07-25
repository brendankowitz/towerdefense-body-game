import { describe, expect, it } from 'vitest';
import { advanceToNextWave, restartCase, startWave, triggerFever } from './commands';
import { CASE_BY_ID } from './content/cases';
import {
  FEVER_DURATION, IMMUNITY_MAX, STEP_SECONDS, TISSUE_PIPS, WAVE_CLEAR_ENERGY,
} from './content/rules';
import { DEFAULT_SELECTION, createSimState } from './state';
import { step } from './step';
import { addEnemy, addTower } from './testing';
import type { CaseId, SimState, StrainId } from './types';

/**
 * Run flow, not combat. The rule under test is "queue empty and board empty ends the wave", so
 * these tests reach that condition directly instead of boarding defenders and hoping the maths
 * works out — an outcome that depends on damage-per-second beating hit-points-over-distance is a
 * balance assertion in disguise and a legitimate retune turns it red. The combat pipeline is
 * pinned by construction in step.test.ts.
 */

const STEPS_PER_SECOND = Math.round(1 / STEP_SECONDS);

/** Throat by default: its rule is `virus`, so no wound bleed moves energy underneath a test. */
function runFor(
  caseId: CaseId = 'throat',
  immunity: Partial<Record<StrainId, number>> = {},
): SimState {
  return createSimState({
    caseId,
    immunity: { staph: 0, film: 0, virus: 0, ...immunity },
    clearedCount: 2,
    totalKills: 0,
  });
}

/** End the running wave by fiat: drain the spawn queue and the board, then step once. */
function drainWave(state: SimState): void {
  state.queue = [];
  state.enemies = [];
  step(state, STEP_SECONDS);
}

function advance(state: SimState, seconds: number): void {
  const steps = Math.round(seconds * STEPS_PER_SECOND);
  for (let taken = 0; taken < steps; taken += 1) step(state, STEP_SECONDS);
}

/** Bounded, so a condition that never holds fails the suite instead of hanging it. */
function advanceUntil(state: SimState, done: () => boolean, maxSteps = 3000): void {
  for (let taken = 0; taken < maxSteps; taken += 1) {
    if (done()) return;
    step(state, STEP_SECONDS);
  }
  throw new Error(`condition never held within ${String(maxSteps)} steps`);
}

describe('wave flow', () => {
  it('ends the wave and pays the wave bonus when the queue and the board are empty', () => {
    const state = runFor();
    startWave(state);
    expect(state.phase).toBe('wave');
    const before = state.energy;

    drainWave(state);

    expect(state.phase).toBe('built');
    expect(state.result).toBe('wave');
    expect(state.energy).toBe(before + WAVE_CLEAR_ENERGY);
  });

  it('pays the wave bonus once, however long the board stays empty afterwards', () => {
    const state = runFor();
    startWave(state);
    drainWave(state);
    const banked = state.energy;

    advance(state, 5);

    expect(state.energy).toBe(banked);
    expect(state.phase).toBe('built');
  });

  it('carries unspent energy into the next wave and clears the result', () => {
    const state = runFor();
    startWave(state);
    drainWave(state);
    const banked = state.energy;

    advanceToNextWave(state);

    expect(state.waveIndex).toBe(1);
    expect(state.phase).toBe('build');
    expect(state.result).toBeNull();
    expect(state.energy).toBe(banked);
    expect(state.selected).toBe(DEFAULT_SELECTION);
  });

  it('refuses to advance while the wave is still running', () => {
    const state = runFor();
    startWave(state);

    advanceToNextWave(state);

    expect(state.waveIndex).toBe(0);
    expect(state.phase).toBe('wave');
  });

  it('marks the case cleared after the final wave, and pays no wave bonus for it', () => {
    const state = runFor();
    state.waveIndex = state.waveCount - 1;
    startWave(state);
    const before = state.energy;

    drainWave(state);

    expect(state.phase).toBe('done');
    expect(state.result).toBe('case');
    expect(state.energy).toBe(before);
  });

  it('refuses to advance past a finished case', () => {
    const state = runFor();
    state.waveIndex = state.waveCount - 1;
    startWave(state);
    drainWave(state);

    advanceToNextWave(state);

    expect(state.waveIndex).toBe(state.waveCount - 1);
    expect(state.phase).toBe('done');
    expect(state.result).toBe('case');
  });

  it('runs every wave of the case and ends on the last one', () => {
    const state = runFor();
    for (let wave = 0; wave < state.waveCount; wave += 1) {
      expect(state.waveIndex).toBe(wave);
      startWave(state);
      drainWave(state);
      if (wave < state.waveCount - 1) advanceToNextWave(state);
    }

    expect(state.phase).toBe('done');
    expect(state.result).toBe('case');
  });
});

describe('tissue', () => {
  it('starts every case with a full set of pips', () => {
    expect(runFor().tissue).toBe(TISSUE_PIPS);
  });

  it('ends the case the moment tissue runs out, even on the wave that would clear it', () => {
    const state = runFor();
    state.waveIndex = state.waveCount - 1;
    startWave(state);
    state.queue = [];
    for (let leak = 0; leak < TISSUE_PIPS; leak += 1) {
      addEnemy(state, 'staph', { distance: state.path.total - 1 });
    }

    step(state, 1);

    expect(state.tissue).toBe(0);
    expect(state.result).toBe('lost');
    expect(state.phase).toBe('done');
  });

  it('holds the case open while a single pip is left', () => {
    const state = runFor();
    startWave(state);
    state.queue = [];
    for (let leak = 0; leak < TISSUE_PIPS - 1; leak += 1) {
      addEnemy(state, 'staph', { distance: state.path.total - 1 });
    }

    step(state, 1);

    expect(state.tissue).toBe(1);
    expect(state.result).toBe('wave');
  });
});

describe('fever', () => {
  it('is recharged, with the wave counters, at the start of every wave', () => {
    const state = runFor();
    startWave(state);
    state.fever = FEVER_DURATION;
    state.feverUsed = true;
    state.waveKills = 9;
    state.waveLeaks = 2;

    drainWave(state);
    advanceToNextWave(state);
    startWave(state);

    expect(state.fever).toBe(0);
    expect(state.feverUsed).toBe(false);
    expect(state.waveKills).toBe(0);
    expect(state.waveLeaks).toBe(0);
  });

  it('can be used once per wave and expires after its duration', () => {
    const state = runFor();
    startWave(state);
    // One queued spawn held back past the fever's lifetime keeps the wave open while it runs down.
    state.queue = ['staph'];
    state.spawnTimer = FEVER_DURATION * 2;

    triggerFever(state);
    expect(state.fever).toBe(FEVER_DURATION);

    advance(state, FEVER_DURATION / 2);
    expect(state.fever).toBeGreaterThan(0);

    triggerFever(state);
    expect(state.fever).toBeLessThan(FEVER_DURATION);

    advance(state, FEVER_DURATION / 2 + 1);
    expect(state.fever).toBe(0);
    expect(state.feverUsed).toBe(true);
    // The wave never ended, so the timer really was what ran the fever out.
    expect(state.phase).toBe('wave');
  });
});

describe('restartCase', () => {
  it('yields a fresh board, keeping only what the profile already holds', () => {
    const spent = runFor('forearm', { staph: IMMUNITY_MAX });
    spent.shieldedWave = 0;
    spent.waveIndex = spent.waveCount - 1;
    spent.tissue = 1;
    spent.energy = 0;
    spent.phase = 'done';
    spent.result = 'lost';
    addTower(spent, 'clot', 0, 0, 0);

    const restarted = restartCase(spent);

    expect(restarted.towers).toHaveLength(0);
    expect(restarted.enemies).toHaveLength(0);
    expect(restarted.waveIndex).toBe(0);
    expect(restarted.tissue).toBe(TISSUE_PIPS);
    expect(restarted.energy).toBe(CASE_BY_ID.forearm.startingEnergy);
    expect(restarted.phase).toBe('build');
    expect(restarted.result).toBeNull();
    expect(restarted.caseId).toBe(spent.caseId);
    expect(restarted.immunity).toEqual(spent.immunity);
    expect(restarted.clearedCount).toBe(spent.clearedCount);
  });

  /**
   * Decision D2. The prototype spent the shield against an instance field that outlived the
   * case, so a replay silently lost the bounce. Asserted through the bounce itself, not just
   * the field: the shield is only really rearmed if a staph actually bounces again.
   */
  it('arms the tetanus shield again for a replayed case — decision D2', () => {
    const first = runFor('forearm', { staph: IMMUNITY_MAX });
    startWave(first);
    advanceUntil(first, () => first.shieldedWave !== null);
    expect(first.enemies).toHaveLength(0);

    const replay = restartCase(first);
    expect(replay.shieldedWave).toBeNull();

    startWave(replay);
    advanceUntil(replay, () => replay.shieldedWave !== null);
    expect(replay.enemies).toHaveLength(0);
  });
});
