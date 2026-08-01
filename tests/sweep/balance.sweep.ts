import { beforeAll, describe, expect, it } from 'vitest';
import { CASES } from '../../src/game/content/cases';
import { DEFENDERS } from '../../src/game/content/defenders';
import { BOARD_WIDTH, TISSUE_PIPS } from '../../src/game/content/rules';
import { dwellSeconds } from '../../src/game/coverage';
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

/**
 * The one case this sweep measures without gating: the heart. Every other case is entered at a
 * fixed, known point in the season — `clearedCount` cases cleared, that immunity, that dock — so
 * "every affordable board" is a real population of runs a player could actually be in. The last
 * stand has no such fixed point. It is reached by losing ground, not by clearing it, so the bank,
 * the immunity and even which cells are unlocked all vary with how the run that got there went —
 * the opposite of what this harness assumes about every other row. Measured anyway (the number is
 * printed below), because a rate is still worth seeing; asserted against Task 13's whole-run sweep
 * instead, which is the instrument that can actually see the run this case is fought at the end of.
 */
const UNGATED: ReadonlySet<CaseId> = new Set(['heart']);

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

/**
 * What every build spot of a case is worth, before a single board is played.
 *
 * **This exists because two of the twelve tuning passes that authored days 5 to 7 were spent
 * without it.** The measles case opened under the floor with four boards in five dying on wave 1;
 * two passes went into softening the wave table and adding starting energy, and moved the rate by
 * nothing. The cause was geometry — summed over its five spots a phagocyte covered 9.1 seconds of
 * vessel against forearm's 14.8 and hand's 17.2, the thinnest board in the season — and pulling
 * three spots in was worth **+3.5 points**, ten times what either count lever bought.
 *
 * `content.invariants.test.ts` was already computing exactly this number and asserting a floor
 * against it. A case can sit far above that floor and still be the thinnest board in the season, so
 * the floor could not have said so; the number could, and nobody was printing it.
 *
 * **It reports and never gates.** There is no threshold here and there should not be one: what
 * counts as too thin depends on the rule, the path length and how much the case is meant to hurt,
 * which is an author's judgement. The floor in `content.invariants.test.ts` is what catches a spot
 * nothing can fight from; this is for seeing that a board is an outlier while still legal.
 *
 * Printed at the top of the run rather than beside the results. `disableConsoleIntercept` puts it
 * on the terminal immediately, so it lands in the first second of a run that takes minutes — early
 * enough to stop one and go and move a spot instead.
 */
function coverageReport(): string {
  // The cheapest cell, derived the way `content.invariants.test.ts` derives it: it is the reach
  // every board can afford everywhere, so it is the one whose coverage describes the case rather
  // than describing a build. Reading a fixed kind here would go quiet the day costs are retuned.
  const cheapest = Object.values(DEFENDERS).reduce((a, b) => (a.cost <= b.cost ? a : b));

  const rows = CASES.map((definition) => {
    const perSpot = definition.spots.map(
      (spot) => dwellSeconds(spot, definition.path, cheapest.range),
    );
    const total = perSpot.reduce((sum, seconds) => sum + seconds, 0);
    return [
      `  ${definition.id.padEnd(11)}`,
      `${total.toFixed(1).padStart(5)}s total`,
      `[${perSpot.map((seconds) => seconds.toFixed(1).padStart(4)).join(' ')}]`,
    ].join('  ');
  });

  return [
    `SPOT COVERAGE — seconds of vessel the ${cheapest.kind} covers per spot, at the slowest pathogen`,
    ...rows,
    '  (a report, not a gate; the floor every spot must clear is content.invariants.test.ts)',
  ].join('\n');
}

/**
 * What each case's board is *like*, beside what it is worth — and the report that would have made
 * the season's biggest content defect visible while it was being authored.
 *
 * Days 1 to 7 were authored one at a time against a clear rate, and came out as one board seven
 * times: every vessel entered off the left edge and left through the floor, every path ran down and
 * to the right, and the five spots sat within twelve units of the same offset in all seven. Nothing
 * in the harness disagreed, because nothing in the harness was looking at the shape — the sweep
 * measured how hard each board was and never once said what it looked like.
 *
 * Four columns, and each one is a way a case can be a copy of the one before it:
 *
 * - **in / out** — which edge the vessel enters and leaves by. Seven cases shared one pair.
 * - **flow** — the share of the path's length running down against up, as a single signed number.
 *   Near +100 is a board that drains; near −100 is one that climbs.
 * - **spots** — the mean distance from a build spot to the vessel. This is the number that decides
 *   which cells can fight from where, and a season that authors it to one value has one placement
 *   decision wearing ten sets of coordinates.
 * - **new** — the pathogens this case sends that no earlier case did. Days 4, 5 and 6 sent nothing
 *   new at all, which is what "no progression" looks like as data.
 *
 * Like the coverage report above, it reports and never gates. What *is* gated is the weakest claim
 * that would have failed on the seven — that the season does not enter every board from the same
 * side — and it lives in `content.invariants.test.ts` beside the other structural checks.
 */
function shapeReport(): string {
  const seen = new Set<string>();

  const rows = CASES.map((definition) => {
    const points = definition.path;
    let down = 0;
    let up = 0;
    let length = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      if (a === undefined || b === undefined) continue;
      const dy = b[1] - a[1];
      if (dy > 0) down += dy; else up += -dy;
      length += Math.hypot(b[0] - a[0], dy);
    }
    const flow = down + up === 0 ? 0 : ((down - up) / (down + up)) * 100;

    const offsets = definition.spots.map((spot) => {
      let best = Number.POSITIVE_INFINITY;
      for (let i = 0; i < points.length - 1; i += 1) {
        const a = points[i];
        const b = points[i + 1];
        if (a === undefined || b === undefined) continue;
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const l2 = dx * dx + dy * dy;
        const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((spot[0] - a[0]) * dx + (spot[1] - a[1]) * dy) / l2));
        best = Math.min(best, Math.hypot(spot[0] - (a[0] + t * dx), spot[1] - (a[1] + t * dy)));
      }
      return best;
    });
    const meanOffset = offsets.reduce((sum, value) => sum + value, 0) / offsets.length;

    const kinds = new Set(definition.waves.flat().map((entry) => entry.kind));
    const fresh = [...kinds].filter((kind) => !seen.has(kind));
    for (const kind of kinds) seen.add(kind);

    const ends = (point: readonly [number, number] | undefined): string => {
      if (point === undefined) return '?';
      const [x, y] = point;
      if (x <= 0) return 'left';
      if (x >= BOARD_WIDTH) return 'right';
      if (y <= 0) return 'top';
      return 'bottom';
    };

    return [
      `  ${definition.id.padEnd(11)}`,
      `${ends(points[0]).padEnd(7)}→ ${ends(points[points.length - 1]).padEnd(7)}`,
      `${length.toFixed(0).padStart(4)}u`,
      `flow ${(flow >= 0 ? '+' : '') + flow.toFixed(0)}`.padEnd(10),
      `spots ${meanOffset.toFixed(0).padStart(2)}u`,
      `new: ${fresh.length === 0 ? '—' : fresh.join(',')}`,
    ].join('  ');
  });

  return [
    'SEASON SHAPE — what each board is like, not what it is worth',
    ...rows,
    '  (a report, not a gate; what is gated is in content.invariants.test.ts)',
  ].join('\n');
}

describe('affordable-board sweep', () => {
  // The sweep itself, run once. In a hook rather than the describe body so its minutes are spent
  // under `hookTimeout` and its output lands with the run rather than with collection.
  let results: readonly SweepResult[] = [];

  beforeAll(() => {
    console.log(shapeReport());
    console.log(coverageReport());
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
      if (UNGATED.has(result.caseId)) continue;
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

  /**
   * Read through a function, not a const: `results` is only filled once `beforeAll` has run.
   * The heart is dropped here for the same reason it is skipped above: the curve this measures is
   * a season played case by case at a known point in progression, and the last stand is neither —
   * its own rate would read as the season going easier at the very end, which is not what it is.
   */
  const season = (): readonly SeasonCase[] =>
    results
      .filter((result) => !UNGATED.has(result.caseId))
      .map((result) => ({ caseId: result.caseId, rate: result.clears / result.boards }));

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
