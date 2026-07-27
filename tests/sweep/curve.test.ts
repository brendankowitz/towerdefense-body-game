import { describe, expect, it } from 'vitest';
import { TREND_MINIMUM_CASES, pushoverFailures, trendFailures, type SeasonCase } from './curve';

/**
 * The season-curve gate's own tests. `balance.sweep.ts` feeds these functions rates measured over
 * tens of thousands of boards and takes minutes to do it; every season below is written by hand and
 * runs in microseconds, which is the only way the gate itself gets exercised on every change rather
 * than on the runs somebody remembered to do.
 *
 * Every expected percentage here is worked out from the rates in the fixture, never read back from
 * the function. An assertion that recomputes what the code computes agrees with the code by
 * construction and holds nothing.
 */

/** A season of the given clear rates, named `case1`, `case2`, … so failures are readable. */
function season(...rates: readonly number[]): readonly SeasonCase[] {
  return rates.map((rate, index) => ({ caseId: `case${String(index + 1)}`, rate }));
}

describe('pushoverFailures', () => {
  it('passes a season that only ever gets harder', () => {
    expect(pushoverFailures(season(0.13, 0.08, 0.06, 0.05))).toEqual([]);
  });

  it('passes a breather that is well clear of what one body is worth', () => {
    // case3 to case4 is a 2.0-point step back up — two and a half times the 0.8 points that moving
    // a single staph between waves was measured to be worth, and the shape the adjacent-pair
    // staircase this replaced would have called a defect.
    expect(pushoverFailures(season(0.132, 0.063, 0.052, 0.072, 0.055, 0.050))).toEqual([]);
  });

  it('reports a late case that is easier than the opening one, naming both and their rates', () => {
    expect(pushoverFailures(season(0.09, 0.07, 0.06, 0.11))).toEqual([
      'case4 clears 11.0% of boards and case1, which opens the season, clears 9.0% — no case may be easier than the case the season opens with',
    ]);
  });

  it('reports every pushover, not just the first', () => {
    const failures = pushoverFailures(season(0.09, 0.12, 0.06, 0.14));
    expect(failures).toHaveLength(2);
    expect(failures[0]).toContain('case2 clears 12.0%');
    expect(failures[1]).toContain('case4 clears 14.0%');
  });

  it('allows a later case to tie the opening one', () => {
    expect(pushoverFailures(season(0.09, 0.06, 0.09))).toEqual([]);
  });

  it('has nothing to compare in a season of one case, or of none', () => {
    expect(pushoverFailures(season(0.09))).toEqual([]);
    expect(pushoverFailures([])).toEqual([]);
  });
});

describe('trendFailures', () => {
  it('passes a season whose back half is harder than its front half', () => {
    expect(trendFailures(season(0.13, 0.08, 0.06, 0.05))).toEqual([]);
  });

  it('passes a breather inside a half, which is what averaging is for', () => {
    // The same six-case season as above: case4 steps 2.0 points back up, and the back half still
    // averages below the front half, so the rhythm costs nothing.
    expect(trendFailures(season(0.132, 0.063, 0.052, 0.072, 0.055, 0.050))).toEqual([]);
  });

  it('reports an inverted season, naming both halves and both averages', () => {
    // front (0.05 + 0.06) / 2 = 5.5%; back (0.07 + 0.13) / 2 = 10.0%.
    expect(trendFailures(season(0.05, 0.06, 0.07, 0.13))).toEqual([
      'the season does not get harder: its front half (case1, case2) clears 5.5% of boards on average and its back half (case3, case4) clears 10.0% — the curve is inverted',
    ]);
  });

  it('allows the halves to tie', () => {
    expect(trendFailures(season(0.09, 0.05, 0.05, 0.09))).toEqual([]);
  });

  it('says nothing about a season too short to describe a curve, even an inverted one', () => {
    const short = season(0.05, 0.13, 0.14).slice(0, TREND_MINIMUM_CASES - 1);
    expect(short).toHaveLength(3);
    expect(trendFailures(short)).toEqual([]);
    expect(trendFailures(season(0.05, 0.13))).toEqual([]);
  });

  it('keeps the middle case of an odd season out of the back half', () => {
    // case3 at 14% is a pushover, and `pushoverFailures` is the check that says so. If it leaked
    // into the back half the average there would be 8.3% against a front half of 5.8% and this
    // would report an inversion that the two ends of the season do not show.
    expect(trendFailures(season(0.06, 0.055, 0.14, 0.058, 0.052))).toEqual([]);
  });

  it('keeps the middle case of an odd season out of the front half', () => {
    // Genuinely inverted at the ends — front 5.1%, back 6.1%. case3 at 14% would lift a leaking
    // front half to 8.1% and hide it.
    expect(trendFailures(season(0.05, 0.052, 0.14, 0.06, 0.062))).toEqual([
      'the season does not get harder: its front half (case1, case2) clears 5.1% of boards on average and its back half (case4, case5) clears 6.1% — the curve is inverted',
    ]);
  });
});
