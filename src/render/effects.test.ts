import { describe, expect, it } from 'vitest';
import {
  BURST_SECONDS, PUFF_SECONDS, burstDiscAlpha, burstProgress, burstRingAlpha, burstRingRadius,
  clamp01, isPuffAlive, puffAlpha, puffScale,
} from './effects';

/** Enough samples to catch a curve that is not a curve. */
const SAMPLES = 16;

function sample(count: number, of: (t: number) => number): number[] {
  const values: number[] = [];
  for (let i = 0; i <= count; i += 1) values.push(of(i / count));
  return values;
}

function isIncreasing(values: readonly number[]): boolean {
  return values.every((value, i) => i === 0 || value > (values[i - 1] ?? Number.NaN));
}

function isDecreasing(values: readonly number[]): boolean {
  return values.every((value, i) => i === 0 || value < (values[i - 1] ?? Number.NaN));
}

describe('clamp01', () => {
  it('passes a fraction through untouched', () => {
    expect(clamp01(0.37)).toBe(0.37);
  });

  it('holds the ends', () => {
    expect(clamp01(-4)).toBe(0);
    expect(clamp01(4)).toBe(1);
  });
});

describe('burstProgress', () => {
  it('is nothing the instant the burst lands', () => {
    expect(burstProgress(BURST_SECONDS)).toBe(0);
  });

  it('is complete when the flash has run out', () => {
    expect(burstProgress(0)).toBe(1);
  });

  it('is half way at half the flash', () => {
    expect(burstProgress(BURST_SECONDS / 2)).toBeCloseTo(0.5, 12);
  });

  /**
   * The duration is a restatement of a number that lives in the simulation, so a burst that
   * outlasts or undershoots it has to stay drawable rather than produce a negative radius.
   */
  it('stays inside its ends when the simulation disagrees about the duration', () => {
    expect(burstProgress(BURST_SECONDS * 3)).toBe(0);
    expect(burstProgress(-1)).toBe(1);
  });
});

describe('burstRingRadius', () => {
  it('starts at the cell it left', () => {
    expect(burstRingRadius(0, 20, 90)).toBe(20);
  });

  it('arrives exactly at the edge of what it hit', () => {
    expect(burstRingRadius(1, 20, 90)).toBe(90);
  });

  it('only ever travels outward', () => {
    expect(isIncreasing(sample(SAMPLES, (t) => burstRingRadius(t, 20, 90)))).toBe(true);
  });

  /**
   * The pulse has to leave fast and settle, or it reads as a ring being drawn rather than a
   * front being thrown. Linear interpolation would put it at half way at half time.
   */
  it('is more than half way out at half the flash', () => {
    expect(burstRingRadius(0.5, 0, 100)).toBeGreaterThan(60);
  });

  it('never leaves the range, whatever it is handed', () => {
    expect(burstRingRadius(2, 20, 90)).toBe(90);
    expect(burstRingRadius(-2, 20, 90)).toBe(20);
  });
});

describe('burst alphas', () => {
  it('fade the ring out over the flash', () => {
    expect(burstRingAlpha(1)).toBe(0);
    expect(burstRingAlpha(0)).toBeGreaterThan(0);
    expect(isDecreasing(sample(SAMPLES, burstRingAlpha))).toBe(true);
  });

  it('fade the disc out over the flash', () => {
    expect(burstDiscAlpha(1)).toBe(0);
    expect(burstDiscAlpha(0)).toBeGreaterThan(0);
    expect(isDecreasing(sample(SAMPLES, burstDiscAlpha))).toBe(true);
  });

  /** The disc says "all of this was hit"; the ring is the front. The front is the louder one. */
  it('draw the ring over a disc that never hides the board', () => {
    expect(burstRingAlpha(0)).toBeGreaterThan(burstDiscAlpha(0));
    expect(burstDiscAlpha(0)).toBeLessThan(0.3);
  });
});

describe('puffScale', () => {
  it('starts at the size of the pathogen that fell', () => {
    expect(puffScale(0)).toBe(1);
  });

  it('only ever expands', () => {
    expect(isIncreasing(sample(SAMPLES, (t) => puffScale(t * PUFF_SECONDS)))).toBe(true);
  });

  /** Small: it marks where something was, it does not take over the vessel. */
  it('stays under three times the body it came from', () => {
    expect(puffScale(PUFF_SECONDS)).toBeGreaterThan(1.5);
    expect(puffScale(PUFF_SECONDS)).toBeLessThan(3);
  });

  it('is most of the way out by half its life, so it reads as a release', () => {
    const half = puffScale(0) + (puffScale(PUFF_SECONDS) - puffScale(0)) / 2;
    expect(puffScale(PUFF_SECONDS / 2)).toBeGreaterThan(half);
  });

  it('holds its final size rather than growing without end', () => {
    expect(puffScale(PUFF_SECONDS * 10)).toBe(puffScale(PUFF_SECONDS));
  });
});

describe('puffAlpha', () => {
  it('is translucent even at its strongest, so it never hides what is behind it', () => {
    expect(puffAlpha(0)).toBeGreaterThan(0);
    expect(puffAlpha(0)).toBeLessThan(0.5);
  });

  it('is gone by the end of its life', () => {
    expect(puffAlpha(PUFF_SECONDS)).toBe(0);
    expect(puffAlpha(PUFF_SECONDS * 10)).toBe(0);
  });

  it('only ever fades', () => {
    expect(isDecreasing(sample(SAMPLES, (t) => puffAlpha(t * PUFF_SECONDS)))).toBe(true);
  });

  it('is half faded half way through', () => {
    expect(puffAlpha(PUFF_SECONDS / 2)).toBeCloseTo(puffAlpha(0) / 2, 12);
  });
});

describe('isPuffAlive', () => {
  it('is alive the frame it opens', () => {
    expect(isPuffAlive(0)).toBe(true);
  });

  it('is alive right up to the end of its life', () => {
    expect(isPuffAlive(PUFF_SECONDS - 0.001)).toBe(true);
  });

  it('is over the moment its life runs out', () => {
    expect(isPuffAlive(PUFF_SECONDS)).toBe(false);
    expect(isPuffAlive(PUFF_SECONDS + 1)).toBe(false);
  });

  /** A frame measured backwards is a broken clock, not a puff that has not started yet. */
  it('is not alive at a negative age', () => {
    expect(isPuffAlive(-0.01)).toBe(false);
  });
});

/**
 * The rule the whole feature is bounded by: a kill is instant and its feedback must not be
 * delayed or obscured. Both effects are over in about a quarter of a second at 1x and half
 * that at 2x, so nothing on this board is ever waiting for an animation to finish.
 */
describe('the effects are short', () => {
  it('keeps a puff and a burst under a third of a second each', () => {
    expect(PUFF_SECONDS).toBeLessThan(0.34);
    expect(BURST_SECONDS).toBeLessThan(0.34);
  });
});
