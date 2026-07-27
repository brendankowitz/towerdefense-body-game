import { beforeAll, describe, expect, it } from 'vitest';
import { CASES } from '../../src/game/content/cases';
import type { CaseId, DefenderKind } from '../../src/game/types';
import { CLEAR_RATE_FLOOR } from './band';
import {
  EVERY_GROWABLE, everyBoard, playBoard, unlockedKinds,
  type GrowableSet, type MaturationPolicy,
} from './playBoard';

/**
 * THE MATURATION COMPARISON. Not part of `npm test`, and not part of `npm run sweep` either — it
 * plays the whole board space once per run below and takes minutes for each.
 *
 *   npm run sweep:maturation
 *
 * `balance.sweep.ts` measures a player who buys and never grows, and used to justify that with
 * the claim that maturing "can only help", so its rate was a floor. That was an argument. This
 * run is the measurement: the same boards, the same simulation, several growth policies, and a
 * count of which boards change hands in which direction.
 *
 * Three questions, and this is what answers each:
 *
 * - **Does maturing help or hurt?** The per-run rate says it on aggregate, and `helped` / `hurt`
 *   say it per board — an aggregate that barely moves can still be a hundred boards won and a
 *   hundred lost, which is a different fact about the game.
 * - **Is any single form a trap?** That is the per-kind axis, and it is the reason this file was
 *   rewritten. The first version measured `'surplus'` and `'eager'` in aggregate, which grow every
 *   form they can afford at once. One number then describes three cells, and it described none of
 *   them: on the tuning of 2026-07-26 the macrophage was a pure win on every case, the fibrin mesh
 *   moved nothing measurable, and the antibody alone lost 485 of throat's 486 winning boards. The
 *   aggregate read as "growing is a rout", which was true of exactly one of the three. A trade is
 *   a property of the form and the geometry, not of which combination of spots happened to grow,
 *   so the form is what gets measured.
 * - **Is the reported rate really a floor?** It is, but not for the reason the old docstring gave.
 *   Maturing is *optional*: a player who declines it plays the buy-only run exactly, so best play
 *   is at least that good whatever growth does. `best` — boards that clear under any run here — is
 *   how much room is left above the floor, and the gap between it and `never` is how loose it is.
 *
 * The shape of a run is a policy per board rather than a cross-product over which cells to grow.
 * The cross-product is ~8× more runs (2^growable-spots, which averages three of five spots), it
 * still would not be best play because it fixes *when* each cell grows, and the extra precision
 * does not change a decision: what a tuning needs to know is the direction and the rough size.
 */

/**
 * One measured way to play. `'never'` is the baseline the others are counted against, so it is not
 * optional; the per-kind runs use `'surplus'` because it is the strongest form of the "growing can
 * only help" claim — it never takes a cell off the board to pay for a growth, so anything it loses
 * it loses on the stat trade alone.
 */
interface Run {
  readonly label: string;
  readonly policy: MaturationPolicy;
  readonly kinds: GrowableSet;
  /** True for the one-kind runs, which are what `a growth offer is never a trap` asserts over. */
  readonly single: DefenderKind | null;
}

const RUNS: readonly Run[] = [
  { label: 'never', policy: 'never', kinds: EVERY_GROWABLE, single: null },
  { label: 'surplus', policy: 'surplus', kinds: EVERY_GROWABLE, single: null },
  { label: 'eager', policy: 'eager', kinds: EVERY_GROWABLE, single: null },
  ...EVERY_GROWABLE.map((kind): Run => ({
    label: `only ${kind}`, policy: 'surplus', kinds: [kind], single: kind,
  })),
];

/**
 * Forms known to fail `worth having`, recorded rather than tuned into passing.
 *
 * `BAND_EXCEPTIONS` in `balance.sweep.ts` is the precedent, and the reason for the shape: a check
 * that is permanently red decays into wallpaper. Someone runs it, learns it is always red, stops
 * reading it, and the day it goes red for a *new* reason nobody notices. An exception keeps the
 * command green and carries the truth, and the assertion fails if a listed form starts passing —
 * so a stale entry is deleted rather than left as a second kind of wallpaper.
 *
 * This is for the one form below and must not become a per-kind opt-out. Widening it is how the
 * next trap walks straight through the hole.
 */
const WORTH_HAVING_EXCEPTIONS: Partial<Record<DefenderKind, string>> = {
  /**
   * The fibrin mesh, measured 2026-07-26: +5 boards won and 23 lost across the season, on every
   * pricing tried. Ten of them, over the whole board space of all three cases, moved single digits
   * out of 3125 and 7776 — and every one scored `+0` on throat.
   *
   * That is not a tuning failure, it is the form. A mesh's gain is a stronger hold and its cost is
   * faster wear, and those are the same currency: total slowing delivered is hold strength times
   * lifetime, and lifetime is one over wear. Pricing them against each other is a wash by
   * construction, which is why the mesh "does nothing measurable" and why no exchange rate fixes
   * it. Reach is the only axis that broke the tie and converted a throat board at all.
   *
   * So the mesh needs a design decision, not a balance pass, and picking whichever of the ten rows
   * happened to land green would be choosing a number because it passed rather than because it was
   * true — the same mistake as the reach literal that started all of this. Delete this entry when
   * the form is redesigned.
   */
  clot: 'grip and wear are the same currency, so the trade cancels itself — see the note above',
};

/** `SWEEP_CASES=forearm npm run sweep:maturation` — same escape hatch as the balance sweep. */
const ONLY = process.env.SWEEP_CASES?.split(',').map((id) => id.trim()).filter((id) => id !== '');

interface SweepCase {
  readonly caseId: CaseId;
  readonly clearedCount: number;
}

const SWEEP: readonly SweepCase[] = CASES
  .map((definition, index) => ({ caseId: definition.id, clearedCount: index }))
  .filter(({ caseId }) => ONLY === undefined || ONLY.includes(caseId));

interface RunResult {
  readonly run: Run;
  readonly clears: number;
  readonly stalls: number;
  /** Cells grown across every board of the case. Zero for `'never'`, by construction. */
  readonly grown: number;
  /** Boards this run clears that `'never'` loses. */
  readonly helped: number;
  /** Boards this run loses that `'never'` clears. */
  readonly hurt: number;
}

interface CaseComparison {
  readonly caseId: CaseId;
  readonly boards: number;
  readonly runs: readonly RunResult[];
  /** Boards that clear under at least one run — the ceiling these policies reach. */
  readonly best: number;
}

interface Tally {
  clears: number;
  stalls: number;
  grown: number;
  helped: number;
  hurt: number;
}

function emptyTally(): Tally {
  return { clears: 0, stalls: 0, grown: 0, helped: 0, hurt: 0 };
}

function compareCase({ caseId, clearedCount }: SweepCase): CaseComparison {
  const definition = CASES.find((c) => c.id === caseId);
  if (definition === undefined) throw new Error(`Unknown case ${caseId}`);

  const tallies = RUNS.map(() => emptyTally());
  let boards = 0;
  let best = 0;

  for (const board of everyBoard(unlockedKinds(clearedCount), definition.spots.length)) {
    boards += 1;

    // Every run is played before anything is counted, so `helped` and `hurt` compare against the
    // baseline rather than against whichever run the loop happened to reach first.
    const outcomes = RUNS.map(
      (run) => playBoard(caseId, clearedCount, board, run.policy, run.kinds),
    );
    const baseline = outcomes[RUNS.findIndex((run) => run.policy === 'never')];
    if (baseline === undefined) throw new Error('the comparison has no never run to compare to');

    outcomes.forEach((outcome, index) => {
      const tally = tallies[index];
      if (tally === undefined) return;
      if (outcome.cleared) tally.clears += 1;
      if (outcome.cleared && !baseline.cleared) tally.helped += 1;
      if (!outcome.cleared && baseline.cleared) tally.hurt += 1;
      if (outcome.stalled) tally.stalls += 1;
      tally.grown += outcome.grown;
    });

    if (outcomes.some((outcome) => outcome.cleared)) best += 1;
  }

  const runs = RUNS.map((run, index) => ({ run, ...(tallies[index] ?? emptyTally()) }));
  return { caseId, boards, runs, best };
}

function rate(clears: number, boards: number): string {
  return `${((clears / boards) * 100).toFixed(1)}%`;
}

function report(comparison: CaseComparison): string {
  const width = Math.max(...RUNS.map((run) => run.label.length));
  const lines = comparison.runs.map((result) => [
    `  ${result.run.label.padEnd(width)}`,
    `${String(result.clears).padStart(5)}/${String(comparison.boards)} clear (${rate(result.clears, comparison.boards).padStart(5)})`,
    `+${String(result.helped)} won / -${String(result.hurt)} lost vs never`,
    `${String(result.grown)} cells grown`,
  ].join('  |  '));

  return [
    `${comparison.caseId} — ${String(comparison.boards)} boards`,
    ...lines,
    `  best of all runs: ${String(comparison.best)} (${rate(comparison.best, comparison.boards)})`,
  ].join('\n');
}

describe('maturation comparison', () => {
  let comparisons: readonly CaseComparison[] = [];

  /** Everything one form won and lost over the whole season, and the per-case split behind it. */
  function seasonTotal(kind: DefenderKind): {
    readonly kind: DefenderKind;
    readonly helped: number;
    readonly hurt: number;
    readonly perCase: readonly string[];
  } {
    let helped = 0;
    let hurt = 0;
    const perCase: string[] = [];
    for (const comparison of comparisons) {
      const result = comparison.runs.find((candidate) => candidate.run.single === kind);
      if (result === undefined) continue;
      helped += result.helped;
      hurt += result.hurt;
      perCase.push(`${comparison.caseId} +${String(result.helped)}/-${String(result.hurt)}`);
    }
    return { kind, helped, hurt, perCase };
  }

  beforeAll(() => {
    comparisons = SWEEP.map(compareCase);
    for (const comparison of comparisons) console.log(report(comparison));
  });

  it('never stalls a wave under any run — growing a cell must not hang a run', () => {
    for (const comparison of comparisons) {
      for (const result of comparison.runs) {
        expect(
          result.stalls,
          `${comparison.caseId}/${result.run.label} stalled ${String(result.stalls)} runs`,
        ).toBe(0);
      }
    }
  });

  /**
   * Without this the whole run could be six identical passes and every number above would agree
   * beautifully about nothing. `'never'` is asserted from the same field, so a run that has
   * quietly stopped being distinguishable fails here rather than reporting a null result.
   */
  it('grows cells under the growing runs and none under never', () => {
    for (const comparison of comparisons) {
      for (const result of comparison.runs) {
        if (result.run.policy === 'never') {
          expect(result.grown, `${comparison.caseId} grew a cell under never`).toBe(0);
        } else {
          expect(
            result.grown,
            `${comparison.caseId}/${result.run.label} grew nothing — the run is not reaching the board`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  /**
   * The first of the two assertions this file exists for, and the one that catches the defect it
   * was written after.
   *
   * What made the high-affinity antibody a trap was not that growing it hurt. It was that growing
   * it took throat from 6.3% of boards clearing to **0.0%** and stomach from 5.5% to 0.5% — it did
   * not cost the player some boards, it deleted the case. A growth is allowed to make a case
   * harder. It is not allowed to make a case nobody can win.
   *
   * So the bar is the band floor, and it is the same floor `balance.sweep.ts` holds the buy-only
   * curve to — shared from `band.ts` rather than written twice, because two floors drift and the
   * day they did this one would be measuring nothing in particular.
   *
   * Per kind and per case, because that is the shape of the defect: one form, one case.
   */
  it('never lets a growth take a case below the floor a case has to clear at', () => {
    const ruined = comparisons.flatMap((comparison) => comparison.runs
      .filter((result) => result.run.single !== null)
      .map((result) => ({ comparison, result, share: result.clears / comparison.boards }))
      .filter(({ share }) => share < CLEAR_RATE_FLOOR)
      .map(({ comparison, result }) =>
        `growing only ${String(result.run.single)} on ${comparison.caseId} clears ${rate(result.clears, comparison.boards)} of boards, under the ${rate(CLEAR_RATE_FLOOR, 1)} floor`));

    expect(ruined, 'a growth offer takes a case below the rate anyone can win it at').toEqual([]);
  });

  /**
   * The second: a growth has to be worth having.
   *
   * The floor above rules out a form that ruins a case. It says nothing about a form that costs
   * most of another cell and changes nothing, which is a different way of taking a player's energy
   * for no decision. `helped > hurt` summed over the season is the statement of worth: take every
   * offer the season makes you, and you must come out ahead.
   *
   * **Summed over the season, never per case.** A form that is strong on two cases and weak on a
   * third is not a trap, it is a choice, and learning that antibodies are wrong on throat is the
   * depth this mechanic exists to create. Per case forbids a form being worse anywhere, which
   * forbids case-shaped trades; and it is worse than merely strict — on a case where a cell is
   * barely used no gain can convert a board, so the only way to pass is to make the downside
   * inert. A rule that can only be satisfied by removing the trade is a rule against trades.
   */
  it('never offers a growth that is not worth having — every form wins more than it loses', () => {
    // Every form is judged before anything is asserted, and the failure names all of them. One
    // `expect` per kind would stop at the first, and this run costs eleven minutes — finding the
    // second bad form should not cost eleven more.
    const failures: string[] = [];
    for (const { kind, helped, hurt, perCase } of EVERY_GROWABLE.map(seasonTotal)) {
      const excused = WORTH_HAVING_EXCEPTIONS[kind];
      const worthHaving = helped > hurt;
      const detail = `wins ${String(helped)} boards across the season and loses ${String(hurt)} (${perCase.join(', ')})`;

      if (excused === undefined) {
        if (!worthHaving) failures.push(`growing only ${kind} ${detail}`);
      } else if (worthHaving) {
        failures.push(`${kind} is listed as a known exception and now passes — ${detail}. Delete its entry in WORTH_HAVING_EXCEPTIONS.`);
      }
    }

    expect(failures, 'a growth offer is not worth what it costs').toEqual([]);
  });
});
