import { describe, expect, it } from 'vitest';
import { SLOWEST_PATHOGEN_SPEED, coveredArc, dwellSeconds } from './coverage';
import { PATHOGENS } from './content/pathogens';
import type { Point } from './types';

/**
 * This module was extracted from a test that only ever asserted a floor against it, and it now
 * feeds two readers: the floor check that gates a case, and the report an author reads when a
 * board is legal but thin. Both would be wrong *together and consistently* if the geometry were
 * wrong, and agreeing with itself is exactly how a check goes quiet.
 *
 * So every expectation below is derived from geometry rather than from the module. A chord of a
 * circle is `2√(r² − d²)` because that is what a chord is, not because `coveredArc` says so.
 */
function chordLength(range: number, distanceFromLine: number): number {
  if (distanceFromLine >= range) return 0;
  return 2 * Math.sqrt(range * range - distanceFromLine * distanceFromLine);
}

/** Long enough that a circle placed near its middle is nowhere near either end. */
const LONG_PATH: readonly Point[] = [[-1000, 0], [1000, 0]];
const RANGE = 74;

describe('coveredArc', () => {
  it('spans a full chord when the path runs clean through the circle', () => {
    expect(coveredArc([0, 0], LONG_PATH, RANGE)).toBeCloseTo(chordLength(RANGE, 0), 6);
  });

  it('shortens as the path passes further from the spot', () => {
    for (const distance of [10, 30, 55, 73]) {
      expect(coveredArc([0, distance], LONG_PATH, RANGE))
        .toBeCloseTo(chordLength(RANGE, distance), 6);
    }
  });

  it('covers nothing when the path stays outside reach', () => {
    expect(coveredArc([0, RANGE + 1], LONG_PATH, RANGE)).toBe(0);
  });

  it('covers nothing when the path is exactly tangent, rather than a sliver or a NaN', () => {
    const tangent = coveredArc([0, RANGE], LONG_PATH, RANGE);
    expect(tangent).toBe(0);
    expect(Number.isNaN(tangent)).toBe(false);
  });

  it('stops at the end of the path rather than at the edge of the circle', () => {
    // The circle reaches x = 74; the vessel stops at x = 50. A cell cannot fight over vessel that
    // is not there, and this is the case that makes an end spot look better than it plays.
    expect(coveredArc([0, 0], [[0, 0], [50, 0]], RANGE)).toBeCloseTo(50, 6);
  });

  it('is unchanged by subdividing a segment', () => {
    // Splitting one segment into two collinear ones describes the same vessel, so it must measure
    // the same. This is what fails if overlapping segments were ever double-counted.
    const whole = coveredArc([0, 20], LONG_PATH, RANGE);
    const split = coveredArc([0, 20], [[-1000, 0], [17, 0], [1000, 0]], RANGE);
    expect(split).toBeCloseTo(whole, 6);
  });

  it('ignores a repeated point instead of dividing by a zero-length segment', () => {
    const doubled = coveredArc([0, 20], [[-1000, 0], [17, 0], [17, 0], [1000, 0]], RANGE);
    expect(doubled).toBeCloseTo(coveredArc([0, 20], LONG_PATH, RANGE), 6);
  });

  it('sums a bent path without exceeding the vessel that exists', () => {
    // An L through the circle: both arms contribute, and the total cannot exceed the path itself.
    const bent: readonly Point[] = [[-40, 0], [0, 0], [0, 40]];
    const covered = coveredArc([0, 0], bent, RANGE);
    expect(covered).toBeCloseTo(80, 6);
  });
});

describe('dwellSeconds', () => {
  const arc = coveredArc([0, 0], LONG_PATH, RANGE);

  it('reports the longest any pathogen would linger, never a shorter one', () => {
    // The generous reading: a spot that is too thin for the slowest thing on the board is too thin
    // for everything. Asserted as a property against every pathogen rather than against the same
    // minimum the module takes, which would agree with it however wrong it was.
    const dwell = dwellSeconds([0, 0], LONG_PATH, RANGE);
    for (const pathogen of Object.values(PATHOGENS)) {
      expect(dwell).toBeGreaterThanOrEqual(arc / pathogen.speed - 1e-9);
    }
    expect(SLOWEST_PATHOGEN_SPEED).toBeLessThanOrEqual(
      Math.min(...Object.values(PATHOGENS).map((pathogen) => pathogen.speed)),
    );
  });

  it('scales with the vessel it covers', () => {
    const near = dwellSeconds([0, 0], LONG_PATH, RANGE);
    const far = dwellSeconds([0, 60], LONG_PATH, RANGE);
    expect(far).toBeLessThan(near);
    expect(near / far).toBeCloseTo(chordLength(RANGE, 0) / chordLength(RANGE, 60), 6);
  });
});
