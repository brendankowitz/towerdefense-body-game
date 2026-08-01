import { describe, expect, it, vi } from 'vitest';
import { GameLoop, MAX_FRAME_SECONDS } from './loop';
import { createSimState } from './state';
import { startWave } from './commands';
import { hashState } from './hash';
import { createRng } from './rng';
import { FAST_MULTIPLIER, STEP_SECONDS } from './content/rules';
import type { CaseId, SimState } from './types';

function armed(caseId: CaseId = 'forearm'): SimState {
  const state = createSimState({
    caseId,
    immunity: { staph: 0, film: 0, virus: 0 },
    day: 1,
    totalKills: 0,
  });
  startWave(state);
  return state;
}

function run(frameCount: number, frameSeconds: number, caseId: CaseId = 'forearm'): GameLoop {
  const loop = new GameLoop(armed(caseId));
  for (let i = 0; i < frameCount; i += 1) loop.advance(frameSeconds);
  return loop;
}

const SIMULATED_SECONDS = 10;

describe('GameLoop frame-rate independence', () => {
  it('simulates identically at 60 Hz and 120 Hz — spec success criterion 2', () => {
    const sixty = run(SIMULATED_SECONDS * 60, 1 / 60);
    const oneTwenty = run(SIMULATED_SECONDS * 120, 1 / 120);

    expect(sixty.stepsTaken).toBeGreaterThan(0);
    expect(oneTwenty.stepsTaken).toBe(sixty.stepsTaken);
    expect(hashState(oneTwenty.state)).toBe(hashState(sixty.state));
  });

  /**
   * Drives a loop until it has completed exactly `steps` fixed steps. Comparing at an equal
   * step count rather than an equal wall-clock duration is the guarantee that actually holds:
   * floating-point accumulation means an arbitrary cutoff can land a single step either side.
   */
  function runToSteps(steps: number, frameSeconds: number): GameLoop {
    const loop = new GameLoop(armed());
    return advanceToSteps(loop, steps, () => frameSeconds);
  }

  /**
   * Bounded so a loop that stops stepping fails the test rather than hanging it — advance() is
   * inert once the wave is over, so an unbounded wait would spin forever.
   */
  function advanceToSteps(loop: GameLoop, steps: number, frame: () => number): GameLoop {
    const budget = steps * 16;
    for (let frames = 0; loop.stepsTaken < steps; frames += 1) {
      if (frames > budget) {
        throw new Error(`loop stopped at ${String(loop.stepsTaken)} of ${String(steps)} steps`);
      }
      loop.advance(frame());
    }
    return loop;
  }

  // 60 and 120 both divide the 1/60 step exactly, so on their own they pass even against a
  // variable-dt loop. 144 does not divide it, which is what makes criterion 2 falsifiable.
  it('reaches the same state after equal steps at 144 Hz, which does not divide the step', () => {
    const sixty = runToSteps(600, 1 / 60);
    const oneFortyFour = runToSteps(600, 1 / 144);

    expect(oneFortyFour.stepsTaken).toBe(sixty.stepsTaken);
    expect(hashState(oneFortyFour.state)).toBe(hashState(sixty.state));
  });

  it('reaches the same state after equal steps when frame times jitter', () => {
    const smooth = runToSteps(600, 1 / 60);

    const rng = createRng(0xc0ffee);
    const jittered = advanceToSteps(new GameLoop(armed()), 600, () => 1 / 120 + rng.next() / 40);

    expect(jittered.stepsTaken).toBe(smooth.stepsTaken);
    expect(hashState(jittered.state)).toBe(hashState(smooth.state));
  });

  it('simulates identically at a stuttering 30 Hz', () => {
    const smooth = run(SIMULATED_SECONDS * 60, 1 / 60);
    const stuttering = run(SIMULATED_SECONDS * 30, 1 / 30);

    expect(stuttering.stepsTaken).toBe(smooth.stepsTaken);
    expect(hashState(stuttering.state)).toBe(hashState(smooth.state));
  });

  it('reaches the same state at every frame rate for every shipped case', () => {
    for (const caseId of ['forearm', 'throat', 'stomach'] as const) {
      const sixty = run(SIMULATED_SECONDS * 60, 1 / 60, caseId);
      const oneTwenty = run(SIMULATED_SECONDS * 120, 1 / 120, caseId);
      expect(hashState(oneTwenty.state), caseId).toBe(hashState(sixty.state));
    }
  });

  it('takes exactly one step per fixed timestep of elapsed time', () => {
    const seconds = 1;
    const loop = run(60, 1 / 60);
    expect(loop.stepsTaken).toBe(Math.round(seconds / STEP_SECONDS));
  });
});

describe('GameLoop', () => {
  it('reproduces a run byte for byte from the same seed — spec success criterion 3', () => {
    expect(hashState(run(600, 1 / 60).state)).toBe(hashState(run(600, 1 / 60).state));
  });

  it('does not step outside the wave phase', () => {
    const state = armed();
    state.phase = 'build';
    const loop = new GameLoop(state);
    loop.advance(1);
    expect(loop.stepsTaken).toBe(0);
  });

  /**
   * The step cap and the frame clamp are two statements of one budget, and they have to agree:
   * time the clamp keeps, the cap must spend. Splitting the same elapsed time into small frames
   * is the falsifier — a cap lower than the clamp needs leaves the single-frame loop behind,
   * which is a wave getting easier because the phone stuttered.
   */
  it('spends the whole clamped frame however that time arrives, at either speed', () => {
    for (const fast of [false, true]) {
      const whole = new GameLoop(armed());
      whole.state.fast = fast;
      whole.advance(MAX_FRAME_SECONDS);

      const split = new GameLoop(armed());
      split.state.fast = fast;
      for (let i = 0; i < 16; i += 1) split.advance(MAX_FRAME_SECONDS / 16);

      const label = fast ? '2x' : '1x';
      expect(whole.stepsTaken, label).toBe(split.stepsTaken);
      expect(hashState(whole.state), label).toBe(hashState(split.state));
    }
  });

  it('discards a long stall rather than fast-forwarding the wave', () => {
    const loop = new GameLoop(armed());
    loop.advance(30);
    expect(loop.stepsTaken).toBeGreaterThan(0);
    expect(loop.stepsTaken * STEP_SECONDS).toBeLessThan(1);
  });

  it('resumes cleanly after a stall without owing the dropped time', () => {
    const loop = new GameLoop(armed());
    loop.advance(30);
    const afterStall = loop.stepsTaken;
    loop.advance(1 / 60);
    expect(loop.stepsTaken).toBe(afterStall + 1);
  });

  it('drops accumulated time when the clock is reset', () => {
    const loop = new GameLoop(armed());
    loop.advance(STEP_SECONDS * 0.9);
    loop.resetClock();
    loop.advance(STEP_SECONDS * 0.9);
    expect(loop.stepsTaken).toBe(0);
  });

  it('runs twice as much simulation per second at 2x speed', () => {
    const normal = run(60, 1 / 60);

    const state = armed();
    state.fast = true;
    const fast = new GameLoop(state);
    for (let i = 0; i < 60; i += 1) fast.advance(1 / 60);

    expect(fast.stepsTaken).toBe(normal.stepsTaken * FAST_MULTIPLIER);
  });

  it('returns a stable snapshot reference until something changes', () => {
    const loop = new GameLoop(armed());
    const first = loop.getSnapshot();
    loop.publish();
    expect(loop.getSnapshot()).toBe(first);
  });

  it('notifies subscribers when the snapshot changes', () => {
    const loop = new GameLoop(armed());
    const listener = vi.fn();
    loop.subscribe(listener);

    for (let i = 0; i < 60; i += 1) loop.advance(1 / 60);

    expect(listener).toHaveBeenCalled();
    expect(loop.getSnapshot().enemyCount).toBeGreaterThan(0);
  });

  it('stops notifying an unsubscribed listener', () => {
    const loop = new GameLoop(armed());
    const listener = vi.fn();
    loop.subscribe(listener)();

    for (let i = 0; i < 60; i += 1) loop.advance(1 / 60);

    expect(listener).not.toHaveBeenCalled();
  });

  it('reports occupied build spots as a bit mask', () => {
    const state = armed();
    state.towers.push({ kind: 'clot', spotIndex: 2, x: 0, y: 0, hp: 1, stun: 0, matured: false });
    const loop = new GameLoop(state);
    loop.publish();
    expect(loop.getSnapshot().occupiedMask).toBe(0b100);
  });

  it('never reports negative energy to the HUD', () => {
    const state = armed();
    state.energy = -5;
    const loop = new GameLoop(state);
    loop.publish();
    expect(loop.getSnapshot().energy).toBe(0);
  });
});
