import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { startWave } from '@game/commands';
import { STEP_SECONDS } from '@game/content/rules';
import { GameLoop } from '@game/loop';
import { createSimState } from '@game/state';
import { useGameLoop } from './useGameLoop';

/** Four and a half steps: enough to be unambiguous, far enough from a boundary to be stable. */
const FRAME_SECONDS = STEP_SECONDS * 4.5;
const EXPECTED_STEPS = 4;

/**
 * Hand-driven animation frames. The hook re-registers from inside its own callback, and
 * React may queue frames of its own, so callbacks are drained as a queue rather than held
 * one at a time.
 */
class FrameDriver {
  #pending: ((timestamp: number) => void)[] = [];
  #hidden = false;

  install(): void {
    vi.stubGlobal('requestAnimationFrame', (callback: (timestamp: number) => void): number => {
      this.#pending.push(callback);
      return this.#pending.length;
    });
    vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => this.#hidden,
    });
  }

  /** Runs every frame callback queued so far with one timestamp, in milliseconds. */
  tick(seconds: number): void {
    const due = this.#pending;
    this.#pending = [];
    act(() => {
      for (const callback of due) callback(seconds * 1000);
    });
  }

  setHidden(hidden: boolean): void {
    this.#hidden = hidden;
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
  }
}

function startedLoop(): GameLoop {
  const state = createSimState({
    caseId: 'forearm',
    immunity: { staph: 0, film: 0, virus: 0 },
    day: 1,
    totalKills: 0,
  });
  startWave(state);
  return new GameLoop(state);
}

function mount(loop: GameLoop, onFrame: () => void): FrameDriver {
  const driver = new FrameDriver();
  driver.install();

  function Harness() {
    useGameLoop(loop, onFrame);
    return null;
  }

  render(<Harness />);
  // The first frame only establishes a timestamp; nothing has elapsed yet.
  driver.tick(0);
  return driver;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useGameLoop', () => {
  it('advances the simulation by the time between frames', () => {
    const loop = startedLoop();
    const driver = mount(loop, () => undefined);

    driver.tick(FRAME_SECONDS);

    expect(loop.stepsTaken).toBe(EXPECTED_STEPS);
  });

  it('does not advance the simulation while the page is hidden', () => {
    const loop = startedLoop();
    const draws = vi.fn();
    const driver = mount(loop, draws);
    // The frame that primed the clock drew once; only what happens while hidden matters here.
    draws.mockClear();
    driver.setHidden(true);

    driver.tick(FRAME_SECONDS);
    driver.tick(FRAME_SECONDS * 2);

    expect(loop.stepsTaken).toBe(0);
    expect(draws).not.toHaveBeenCalled();
  });

  it('drops the time spent hidden instead of fast-forwarding through it', () => {
    const loop = startedLoop();
    const driver = mount(loop, () => undefined);

    // No frames while hidden, because that is what a backgrounded page really does: the
    // browser stops issuing them, so the visibility handler is the only thing that can
    // reset the clock before the first frame back arrives.
    driver.setHidden(true);
    driver.setHidden(false);

    // A minute in the background. The first frame back must be worth nothing, not a minute.
    driver.tick(60);
    expect(loop.stepsTaken).toBe(0);

    driver.tick(60 + FRAME_SECONDS);
    expect(loop.stepsTaken).toBe(EXPECTED_STEPS);
  });

  it('resets the loop clock when the page comes back', () => {
    const loop = startedLoop();
    const resetClock = vi.spyOn(loop, 'resetClock');
    const driver = mount(loop, () => undefined);

    driver.setHidden(true);
    driver.setHidden(false);

    expect(resetClock).toHaveBeenCalled();
  });

  it('draws every visible frame even when the simulation is not running', () => {
    const state = createSimState({
      caseId: 'forearm',
      immunity: { staph: 0, film: 0, virus: 0 },
      day: 1,
      totalKills: 0,
    });
    const loop = new GameLoop(state);
    const draws = vi.fn();
    const driver = mount(loop, draws);

    driver.tick(FRAME_SECONDS);
    driver.tick(FRAME_SECONDS * 2);

    expect(state.phase).toBe('build');
    expect(loop.stepsTaken).toBe(0);
    expect(draws).toHaveBeenCalledTimes(3);
  });
});
