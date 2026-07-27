/**
 * What "the season gets harder as it goes on" is allowed to mean, as arithmetic over clear rates.
 *
 * Its own module, and not inside `balance.sweep.ts`, for one reason: the sweep that feeds it real
 * numbers takes minutes, and a gate nobody can exercise cheaply is a gate nobody checks. Everything
 * here is a pure function of labelled rates, so `curve.test.ts` can hand it a season that inverts,
 * a season with a breather in the middle and a season that is a pushover at the end, and prove it
 * says the right thing about each in milliseconds.
 *
 * ---
 *
 * **Why this is a trend and not a staircase.**
 *
 * This replaced an assertion that each case clear at no higher a rate than the case before it. That
 * is a stronger claim than the design makes and a wrong one: a hard case followed by a breather is
 * pacing, and a gate that forbids rhythm is a gate against authoring.
 *
 * It was also demanding resolution the instrument does not have. **Moving one staph from wave 4 to
 * wave 5 of the hand case — no change at all to the total — moved that case 0.8 points**, from 5.3%
 * of boards clearing to 4.5%. An adjacent-pair staircase, crossed with an absolute floor, gives a
 * whole season a budget of `opening rate − floor` to divide between every case after the first. At
 * the time of that measurement the budget was 4.1 points and four cases had spent 3.8 of it, so the
 * six cases still to be authored had 0.3 points between them — a third of what one body is worth.
 * Any number a tuning pass landed on inside that window was noise.
 *
 * Before tightening any of this back toward adjacency, price it against that 0.8: the cost is not
 * abstract, it is that the remaining cases cannot be authored.
 *
 * ---
 *
 * **What it still catches.** A season that gets *easier* has two shapes, and there is one check for
 * each, because neither sees the other's:
 *
 * - **A late pushover** — one case near the top of the band with a hard season around it. The
 *   average barely notices it, so `pushoverFailures` looks at cases one at a time.
 * - **An inverted curve** — the back of the season easier than the front, with no single case
 *   obviously wrong. No per-case check sees that, so `trendFailures` compares the halves.
 *
 * **Neither carries a tolerance constant, deliberately.** Slack is structural — averaging inside a
 * half, and a ceiling set by a measured case rather than a chosen margin — so there is no number
 * here to quietly widen when a tuning is inconvenient. On the season as measured — 13.2 / 6.3 / 5.5
 * / 5.3 — the halves average 9.8% against 5.4%, so inverting the trend takes a single case moving
 * 8.8 points, and tripping the pushover check takes the hardest case rising 6.9. Both are around
 * ten times what one body is worth.
 *
 * **What it knowingly lets through:** a single mid-season case sitting just under the opening rate,
 * hard cases either side of it. It ties neither check — the average absorbs it and it never rises
 * above the opener. Catching it needs a required drop from the opening case, and a required drop is
 * a margin somebody chooses, which is the number-picking this gate is shaped to avoid. It is also
 * a case still inside the 5–15% band, so what escapes here is an oddly generous case rather than an
 * unplayable season, and reading the rates the sweep prints is enough to see it.
 */

export interface SeasonCase {
  /** Case id, used only to say what was compared when a check fails. */
  readonly caseId: string;
  /** Share of affordable boards that cleared, as a fraction. */
  readonly rate: number;
}

function percent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function names(entries: readonly SeasonCase[]): string {
  return entries.map((entry) => entry.caseId).join(', ');
}

function meanRate(entries: readonly SeasonCase[]): number {
  return entries.reduce((sum, entry) => sum + entry.rate, 0) / entries.length;
}

/**
 * No case may be easier than the case that opens the season.
 *
 * The opening case is the forgiving one by design — it is the first thing a new player meets — so
 * it is the natural ceiling for everything after it, and using it means the bar is a case the
 * season already measured rather than a margin somebody picked. Every later case is free to sit
 * anywhere between it and the floor, and free to wobble against its neighbours; what it may not do
 * is come back up to where the game started.
 */
export function pushoverFailures(season: readonly SeasonCase[]): readonly string[] {
  const opening = season[0];
  if (opening === undefined) return [];

  return season
    .slice(1)
    .filter((entry) => entry.rate > opening.rate)
    .map((entry) =>
      `${entry.caseId} clears ${percent(entry.rate)} of boards and ${opening.caseId}, which opens the season, clears ${percent(opening.rate)} — no case may be easier than the case the season opens with`);
}

/**
 * Under this many cases the halves below are one case each, which is the adjacent pair this module
 * exists to stop asserting. A season that short gets `pushoverFailures` and nothing else — which is
 * the honest answer, since three points do not describe a curve.
 */
export const TREND_MINIMUM_CASES = 4;

/**
 * The back half of the season is at least as hard as the front half.
 *
 * Halves rather than a slope because the failure has to be readable: "these cases average this,
 * those cases average that" says what was compared, and a regression coefficient does not. On an
 * odd-length season the middle case belongs to neither end and is dropped, so the two sides always
 * carry equal weight.
 *
 * Averaging is what buys the tolerance. One case moving 0.8 points shifts its half's mean by 0.8
 * divided by the cases in that half, and it has to shift it past the whole gap between the halves
 * before this says anything.
 */
export function trendFailures(season: readonly SeasonCase[]): readonly string[] {
  if (season.length < TREND_MINIMUM_CASES) return [];

  const half = Math.floor(season.length / 2);
  const front = season.slice(0, half);
  const back = season.slice(season.length - half);
  const frontRate = meanRate(front);
  const backRate = meanRate(back);
  if (backRate <= frontRate) return [];

  return [
    `the season does not get harder: its front half (${names(front)}) clears ${percent(frontRate)} of boards on average and its back half (${names(back)}) clears ${percent(backRate)} — the curve is inverted`,
  ];
}
