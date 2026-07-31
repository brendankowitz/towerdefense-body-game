import { describe, expect, it } from 'vitest';
import {
  BURST_SECONDS, GROWTH_SECONDS, LOAD_MAX_RADIUS, LOAD_MIN_RADIUS, MOTE_COUNT, MOTE_SECONDS,
  PUFF_SECONDS, burstDiscAlpha, burstProgress, burstRingAlpha, burstRingRadius, clamp01,
  growthRingAlpha, growthRingRadius, isGrowthAlive, isPuffAlive, loadRadius, moteAlpha, motePhase,
  moteScale, moteTravel, phagocyteFullness, puffAlpha, puffScale,
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

  /**
   * The growth flourish is the one effect allowed to be longer, and it is bounded anyway: it runs
   * in a build phase where nothing is arriving, so the only thing waiting on it is the player.
   */
  it('keeps the growth flourish under half a second', () => {
    expect(GROWTH_SECONDS).toBeLessThan(0.5);
    expect(GROWTH_SECONDS).toBeGreaterThan(BURST_SECONDS);
  });
});

describe('the growth flourish', () => {
  const FINAL = 25;

  it('is alive the frame the cell grows and over when its life runs out', () => {
    expect(isGrowthAlive(0)).toBe(true);
    expect(isGrowthAlive(GROWTH_SECONDS - 0.001)).toBe(true);
    expect(isGrowthAlive(GROWTH_SECONDS)).toBe(false);
    expect(isGrowthAlive(-0.01)).toBe(false);
  });

  it('starts outside the ring it is closing onto', () => {
    expect(growthRingRadius(0, FINAL)).toBeGreaterThan(FINAL);
  });

  /** The point of the effect: it lands exactly on the ring the cell keeps, not near it. */
  it('closes onto the ring the grown cell wears, and never inside it', () => {
    expect(growthRingRadius(GROWTH_SECONDS, FINAL)).toBeCloseTo(FINAL, 6);
    for (let age = 0; age <= GROWTH_SECONDS * 2; age += GROWTH_SECONDS / 16) {
      expect(growthRingRadius(age, FINAL)).toBeGreaterThanOrEqual(FINAL);
    }
  });

  it('closes inward the whole way, so it never reads as a burst going out', () => {
    let previous = growthRingRadius(0, FINAL);
    for (let age = GROWTH_SECONDS / 16; age <= GROWTH_SECONDS; age += GROWTH_SECONDS / 16) {
      const radius = growthRingRadius(age, FINAL);
      expect(radius).toBeLessThanOrEqual(previous);
      previous = radius;
    }
  });

  it('fades from visible to nothing over its life', () => {
    expect(growthRingAlpha(0)).toBeGreaterThan(0.5);
    expect(growthRingAlpha(GROWTH_SECONDS / 2)).toBeLessThan(growthRingAlpha(0));
    expect(growthRingAlpha(GROWTH_SECONDS)).toBe(0);
    expect(growthRingAlpha(GROWTH_SECONDS * 2)).toBe(0);
  });
});

describe('motePhase', () => {
  it('starts the leading mote on the body it is coming off', () => {
    expect(motePhase(0, 0, 3)).toBe(0);
  });

  /** Spread evenly round the cycle: mote i of c opens a fraction i/c into the crossing. */
  it('spreads the train evenly, whatever the train is', () => {
    expect(motePhase(0, 1, 4)).toBeCloseTo(0.25, 12);
    expect(motePhase(0, 3, 4)).toBeCloseTo(0.75, 12);
    expect(motePhase(0, 2, 5)).toBeCloseTo(0.4, 12);
  });

  it('has the leading mote half way across at half a crossing', () => {
    expect(motePhase(MOTE_SECONDS / 2, 0, 3)).toBeCloseTo(0.5, 12);
  });

  it('sends the next mote after it rather than back the way it came', () => {
    const early = motePhase(MOTE_SECONDS * 0.1, 0, 3);
    const later = motePhase(MOTE_SECONDS * 0.3, 0, 3);
    expect(later).toBeGreaterThan(early);
  });

  /** A stream, not one trip: the cell keeps feeding, so the cycle comes round again. */
  it('starts over when a mote arrives', () => {
    expect(motePhase(MOTE_SECONDS, 0, 3)).toBeCloseTo(0, 12);
    expect(motePhase(MOTE_SECONDS * 2.25, 0, 3)).toBeCloseTo(0.25, 12);
  });

  it('stays a fraction of one crossing however long the cell has been eating', () => {
    for (const age of [0, 0.01, 1, 7.5, 600]) {
      for (let index = 0; index < 3; index += 1) {
        const phase = motePhase(age, index, 3);
        expect(phase).toBeGreaterThanOrEqual(0);
        expect(phase).toBeLessThan(1);
      }
    }
  });
});

describe('moteTravel', () => {
  it('opens on the body and closes at the cell', () => {
    expect(moteTravel(0)).toBe(0);
    expect(moteTravel(1)).toBe(1);
  });

  it('only ever moves towards the cell', () => {
    expect(isIncreasing(sample(SAMPLES, moteTravel))).toBe(true);
  });

  /**
   * Behind a straight run for the whole crossing, so it arrives faster than it left and reads
   * as being pulled in. Half way through the time is not half way along the tether.
   */
  it('runs behind a straight crossing all the way', () => {
    for (const phase of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(moteTravel(phase)).toBeLessThan(phase);
    }
  });

  /** But it is moving the moment it comes off — a mote that sits still first reads as dropped. */
  it('is already travelling as it leaves the body', () => {
    expect(moteTravel(0.02)).toBeGreaterThan(0.02 * 0.4);
  });

  it('covers more of the tether in its last tenth than in its first', () => {
    expect(1 - moteTravel(0.9)).toBeGreaterThan(moteTravel(0.1));
  });

  it('never leaves the tether, whatever it is handed', () => {
    expect(moteTravel(-3)).toBe(0);
    expect(moteTravel(3)).toBe(1);
  });
});

describe('moteScale', () => {
  it('comes off the body at full size and arrives at nothing', () => {
    expect(moteScale(0)).toBe(1);
    expect(moteScale(1)).toBe(0);
  });

  it('only ever shrinks', () => {
    expect(isDecreasing(sample(SAMPLES, moteScale))).toBe(true);
  });

  /** It is swallowed at the end rather than dwindling the whole way, so it is still there to see. */
  it('is still more than half of itself at the half way mark', () => {
    expect(moteScale(0.5)).toBeGreaterThan(0.5);
  });

  it('never inverts or overshoots, whatever it is handed', () => {
    expect(moteScale(-3)).toBe(1);
    expect(moteScale(3)).toBe(0);
  });
});

describe('moteAlpha', () => {
  it('emerges from the body rather than appearing on it', () => {
    expect(moteAlpha(0)).toBe(0);
  });

  it('is fully there long before it arrives, and stays there', () => {
    expect(moteAlpha(0.5)).toBeGreaterThan(0);
    expect(moteAlpha(1)).toBe(moteAlpha(0.5));
  });

  /** Nearly solid: a mote is matter, not a glow — but never quite hides the tether under it. */
  it('is strong but never opaque', () => {
    expect(moteAlpha(1)).toBeGreaterThan(0.5);
    expect(moteAlpha(1)).toBeLessThan(1);
  });

  it('never rises above the strength it settles at', () => {
    for (const alpha of sample(SAMPLES, moteAlpha)) {
      expect(alpha).toBeLessThanOrEqual(moteAlpha(1));
    }
  });
});

describe('phagocyteFullness', () => {
  it('is empty at nothing digested and full at the whole appetite', () => {
    expect(phagocyteFullness(0, 100)).toBe(0);
    expect(phagocyteFullness(100, 100)).toBe(1);
  });

  it('is half full at half the appetite', () => {
    expect(phagocyteFullness(50, 100)).toBe(0.5);
  });

  /** A cell finishes the body it is on, so the bank can overrun the appetite before it rests. */
  it('stops at full rather than overflowing', () => {
    expect(phagocyteFullness(240, 100)).toBe(1);
  });

  it('reads an appetite tuned away as an empty cell, not a permanently full one', () => {
    expect(phagocyteFullness(30, 0)).toBe(0);
    expect(phagocyteFullness(30, -50)).toBe(0);
  });

  it('cannot go below empty', () => {
    expect(phagocyteFullness(-30, 100)).toBe(0);
  });
});

describe('loadRadius', () => {
  it('draws an empty cell the mark it has always had', () => {
    expect(loadRadius(0)).toBe(LOAD_MIN_RADIUS);
  });

  it('draws a full cell the largest mark that fits', () => {
    expect(loadRadius(1)).toBe(LOAD_MAX_RADIUS);
  });

  /** Half a cell's worth of matter is half the growth: nothing about filling up is eased. */
  it('is exactly half way at half full', () => {
    expect(loadRadius(0.5)).toBeCloseTo((LOAD_MIN_RADIUS + LOAD_MAX_RADIUS) / 2, 12);
  });

  it('only ever grows', () => {
    expect(isIncreasing(sample(SAMPLES, loadRadius))).toBe(true);
  });

  it('holds its ends, whatever it is handed', () => {
    expect(loadRadius(-2)).toBe(LOAD_MIN_RADIUS);
    expect(loadRadius(2)).toBe(LOAD_MAX_RADIUS);
  });

  /**
   * The mark is cut out of a cell body of radius 20 wearing a 4 wide paper ring inside its own
   * edge, so it has 16 to grow into — and a full one has to leave a band of the cell's own
   * colour inside that ring, or a full cell stops reading as a cell at all.
   */
  it('leaves the cell visible around even a full load', () => {
    expect(LOAD_MIN_RADIUS).toBeGreaterThan(0);
    expect(LOAD_MAX_RADIUS).toBeGreaterThan(LOAD_MIN_RADIUS);
    expect(LOAD_MAX_RADIUS).toBeLessThanOrEqual(13);
  });

  /** And a full one has to be obviously bigger than an empty one, or the reading buys nothing. */
  it('grows the mark by at least half again over a full cell', () => {
    expect(loadRadius(1)).toBeGreaterThan(loadRadius(0) * 1.5);
  });
});

/**
 * Absorption is a state, not an event: it runs for as long as the cell is eating. What it must
 * not do is read as a threat pulse (spec §7) or as a leash — so a crossing is quick enough to
 * be a stream and the train is small enough to be one.
 */
describe('the crossing reads as a stream', () => {
  it('carries a few motes, quickly', () => {
    expect(MOTE_COUNT).toBeGreaterThan(1);
    expect(MOTE_COUNT).toBeLessThan(6);
    expect(MOTE_SECONDS).toBeGreaterThan(0.2);
    expect(MOTE_SECONDS).toBeLessThan(1);
  });
});
