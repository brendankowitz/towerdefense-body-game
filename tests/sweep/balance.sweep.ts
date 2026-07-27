import { beforeAll, describe, expect, it } from 'vitest';
import { CASES } from '../../src/game/content/cases';
import { TISSUE_PIPS } from '../../src/game/content/rules';
import type { CaseId, DefenderKind } from '../../src/game/types';
import { CLEAR_RATE_CEILING, CLEAR_RATE_FLOOR } from './band';
import { pushoverFailures, trendFailures, type SeasonCase } from './curve';
import { EVERY_GROWABLE, everyBoard, playBoard, unlockedKinds } from './playBoard';

/**
 * THE BALANCE HARNESS. Not part of `npm test` — it takes minutes.
 *
 *   npm run sweep
 *
 * It plays every board the player could actually build, on the real simulation, and counts how
 * many clear. The point is not "is this case winnable" — one winning board in 7776 is a game
 * nobody can find. The point is a *rate*, and a rate that trends down as the season goes on. That
 * is a difficulty curve; "some board somewhere wins" is not. What "trends down" is allowed to mean
 * — and why it is a trend rather than a staircase — is `curve.ts`, which is also where the
 * measurement that settled it is written down.
 *
 * A board is an assignment of a defender kind to each of the five build spots, drawn from the
 * kinds unlocked at that point in progression. The economy decides how much of it gets built —
 * see `playBoard.ts`, which also states what the purchasing policy deliberately does not model.
 *
 * This run buys and never grows (`'never'`), which is the policy every recorded number in this
 * repo was measured under. Whether growing would do better is its own question and its own run:
 *
 *   npm run sweep:maturation
 *
 * That one plays the same board space under three maturation policies and takes three times as
 * long, which is why it is not this gate.
 *
 * When a tuning changes, re-run this and put the numbers in the commit message. That is the whole
 * reason it is committed rather than living in a scratch directory: the next balance pass starts
 * from evidence instead of re-deriving it.
 */

/**
 * The band is asserted here, not printed. A tuning that drops a case out of it turns this red —
 * that is what makes the harness worth committing rather than reporting. The numbers themselves
 * live in `band.ts`, because `maturation.sweep.ts` holds growth to the same floor; the shape of
 * the curve over the band lives in `curve.ts`, because a gate that only runs inside a minutes-long
 * sweep is a gate nobody exercises.
 */

/**
 * A per-case floor, recorded here rather than by lowering the bar for the whole season. No case needs
 * one. Stomach carried an exception at 4.4% until the antibody stopped renewing a
 * mark that was still burning: giving the mark a real duration cost the cell enough that the
 * whole curve came down into the band together, stomach included.
 */
const BAND_EXCEPTIONS: Partial<Record<CaseId, number>> = {};

interface SweepCase {
  readonly caseId: CaseId;
  /** Cases cleared before this one — what decides which cells the dock offers. */
  readonly clearedCount: number;
}

/**
 * The season in the order a real run meets it, each case at the tier it is actually played at.
 *
 * `SWEEP_CASES=stomach npm run sweep` narrows it while iterating on one case — a full pass is
 * minutes and a single case is seconds. The stall and band assertions below still hold for
 * whatever is swept, but the curve ones are only meaningful over the whole season, so a filtered
 * run is a working tool and never the evidence for a tuning.
 */
const ONLY = process.env.SWEEP_CASES?.split(',').map((id) => id.trim()).filter((id) => id !== '');

const SWEEP: readonly SweepCase[] = CASES
  .map((definition, index) => ({ caseId: definition.id, clearedCount: index }))
  .filter(({ caseId }) => ONLY === undefined || ONLY.includes(caseId));

/** Whether this run swept the season rather than a slice of it. Gates the two curve assertions. */
const IS_WHOLE_SEASON = SWEEP.length === CASES.length;

interface SweepResult {
  readonly caseId: CaseId;
  readonly kinds: readonly DefenderKind[];
  readonly boards: number;
  readonly clears: number;
  readonly stalls: number;
  /** How many runs ended on each 1-based wave, cleared or lost. */
  readonly lastWaveHistogram: readonly number[];
  /** How many clears finished on each pip count, indexed by pips remaining. */
  readonly clearPips: readonly number[];
  readonly bestBoard: readonly DefenderKind[] | null;
}

function sweepCase({ caseId, clearedCount }: SweepCase): SweepResult {
  const definition = CASES.find((c) => c.id === caseId);
  if (definition === undefined) throw new Error(`Unknown case ${caseId}`);

  const kinds = unlockedKinds(clearedCount);
  const lastWaveHistogram = Array.from({ length: definition.waves.length + 1 }, () => 0);
  const clearPips = Array.from({ length: TISSUE_PIPS + 1 }, () => 0);

  let boards = 0;
  let clears = 0;
  let stalls = 0;
  let bestBoard: readonly DefenderKind[] | null = null;
  let bestTissue = -1;

  for (const board of everyBoard(kinds, definition.spots.length)) {
    // `'never'` grows nothing, so the set it is handed cannot change the outcome. Passed as
    // every growable kind rather than as nothing, so this line says "a player who declines the
    // offers" and not "a player the harness never offers anything to".
    const outcome = playBoard(caseId, clearedCount, board, 'never', EVERY_GROWABLE);
    boards += 1;
    if (outcome.stalled) stalls += 1;

    lastWaveHistogram[outcome.lastWave] = (lastWaveHistogram[outcome.lastWave] ?? 0) + 1;
    if (outcome.cleared) {
      clears += 1;
      clearPips[outcome.tissue] = (clearPips[outcome.tissue] ?? 0) + 1;
      if (outcome.tissue > bestTissue) {
        bestTissue = outcome.tissue;
        bestBoard = board;
      }
    }
  }

  return { caseId, kinds, boards, clears, stalls, lastWaveHistogram, clearPips, bestBoard };
}

function report(result: SweepResult): string {
  const rate = ((result.clears / result.boards) * 100).toFixed(1);
  const waves = result.lastWaveHistogram
    .map((count, wave) => (wave === 0 ? null : `w${String(wave)}:${String(count)}`))
    .filter((entry) => entry !== null)
    .join(' ');
  const pips = result.clearPips
    .map((count, pip) => (count === 0 ? null : `${String(pip)}pip:${String(count)}`))
    .filter((entry) => entry !== null)
    .join(' ');

  const inBand = result.clears / result.boards >= CLEAR_RATE_FLOOR
    && result.clears / result.boards <= CLEAR_RATE_CEILING;

  return [
    `${result.caseId.padEnd(8)} ${String(result.kinds.length)} cells`,
    `${String(result.clears)}/${String(result.boards)} clear (${rate}%${inBand ? '' : ', OUT OF BAND'})`,
    `ended on [${waves}]`,
    pips === '' ? 'no clears' : `clears finished on [${pips}]`,
    result.bestBoard === null ? '' : `best: ${result.bestBoard.join(',')}`,
  ].join('  |  ');
}

describe('affordable-board sweep', () => {
  // The sweep itself, run once. In a hook rather than the describe body so its minutes are spent
  // under `hookTimeout` and its output lands with the run rather than with collection.
  let results: readonly SweepResult[] = [];

  beforeAll(() => {
    results = SWEEP.map(sweepCase);
    for (const result of results) console.log(report(result));
  });

  it('never stalls a wave — a run that cannot end is a harness bug or a simulation one', () => {
    for (const result of results) {
      expect(result.stalls, `${result.caseId} stalled ${String(result.stalls)} runs`).toBe(0);
    }
  });

  it('clears every case at a rate a player can actually stumble into', () => {
    for (const result of results) {
      const rate = result.clears / result.boards;
      const floor = BAND_EXCEPTIONS[result.caseId] ?? CLEAR_RATE_FLOOR;
      expect(
        rate,
        `${result.caseId} clears ${String(result.clears)} of ${String(result.boards)} boards — below the floor, so nobody finds a win`,
      ).toBeGreaterThanOrEqual(floor);
      expect(
        rate,
        `${result.caseId} clears ${String(result.clears)} of ${String(result.boards)} boards — above the ceiling, so the board is not a decision`,
      ).toBeLessThanOrEqual(CLEAR_RATE_CEILING);
    }
  });

  /** Read through a function, not a const: `results` is only filled once `beforeAll` has run. */
  const season = (): readonly SeasonCase[] =>
    results.map((result) => ({ caseId: result.caseId, rate: result.clears / result.boards }));

  /*
   * The two curve checks, and what each is for is in `curve.ts` rather than restated here.
   *
   * Both only mean anything over the whole season: narrowed to some of it, the first case swept is
   * not the case the season opens with and the halves are not the season's halves. Skipped rather
   * than quietly satisfied, so a narrowed run shows on the report that it measured no curve — the
   * same thing the note on `ONLY` says in words.
   */
  it.skipIf(!IS_WHOLE_SEASON)('never makes a case easier than the one the season opens with', () => {
    expect(
      pushoverFailures(season()),
      'a case later in the season is a pushover',
    ).toEqual([]);
  });

  it.skipIf(!IS_WHOLE_SEASON)('gets harder as the season goes on, as a trend rather than a staircase', () => {
    expect(
      trendFailures(season()),
      'the season does not get harder as it goes on',
    ).toEqual([]);
  });
});
