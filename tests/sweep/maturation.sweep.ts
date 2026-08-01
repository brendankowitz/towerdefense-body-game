import { beforeAll, describe, expect, it } from 'vitest';
import { CASES } from '../../src/game/content/cases';
import { maturedFormOf } from '../../src/game/content/maturation';
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
 *   so the form is what gets measured. Two of those three findings became changes: the antibody was
 *   rebuilt around its pulse, and the mesh was deleted outright — `maturation.ts` records why.
 * - **Is the reported rate really a floor?** It is, but not for the reason the old docstring gave.
 *   Maturing is *optional*: a player who declines it plays the buy-only run exactly, so best play
 *   is at least that good whatever growth does. `best` — boards that clear under any run here — is
 *   how much room is left above the floor, and the gap between it and `never` is how loose it is.
 *
 * The shape of a run is a policy per board rather than a cross-product over which cells to grow.
 * The cross-product is several times the runs (2^growable-spots, and a board holds a couple of
 * those), it still would not be best play because it fixes *when* each cell grows, and the extra
 * precision does not change a decision: what a tuning needs to know is the direction and the size.
 *
 * ---
 *
 * **There is no growth ceiling, and that is a decision rather than an omission.**
 *
 * Growing every cell it can afford takes the forearm case to the highest `best` figure in the
 * season — a quarter of its board space, against a buy-only rate a third of that. Nothing here
 * caps it. The question of whether it should was asked and answered no, for three reasons, and
 * this is the file the next person will look in:
 *
 * - **A ceiling would be a chosen number.** The band's floor is a design target and the curve's
 *   two checks are shaped around a measured case rather than a picked margin — see `curve.ts`,
 *   which spends most of its docstring explaining why. A cap on growth would be neither: nothing
 *   measures what share of boards a growing player is *allowed* to win, so any figure put here
 *   would be somebody's taste wearing an assertion.
 * - **The opening case being forgiving to good play is correct.** Forearm is where the mechanic is
 *   safe to learn. A player who works out that growing helps, on the first case, and is rewarded
 *   for it, has understood the game — capping that is punishing the thing the case is for.
 * - **The risk it would guard against is already refuted.** "Growth trivialises the season" would
 *   show up as growth being right everywhere, and it is not. Three of the seven cases say no:
 *   throat (6.3% buying, 5.9% growing), measles (7.2% down to 6.7%) and sinus, where growing
 *   eagerly is a rout — 2.5% against 6.3%, 307 boards lost and 18 won. The two assertions below
 *   already forbid the two failures that matter: a form that ruins a case, and a form that is not
 *   worth its price.
 *
 * **Two observations to have before anyone gates growth later.**
 *
 * **Under a growth policy the curve is not monotonic.** Throat is harder than stomach for a player
 * who grows — 5.9% against 14.0% — though the buy-only curve has them 6.3% and 5.5%, the other way
 * round. Throat punishes reflexive growing and stomach does not. Any future ceiling therefore
 * cannot be a single number applied per case in season order, because the ordering it would be
 * enforcing does not exist under that policy. That is a fact about the content, not a defect: a
 * rule that makes the obvious upgrade wrong is the depth this mechanic was added for.
 *
 * **And the allergy case gates growth by itself, without anything here saying so.** Sinus grows 366
 * cells across its whole board space where hand grows 7500, and `surplus` clears it at exactly the
 * buy-only rate — not similar, identical, board for board. The reason is worth keeping: that case's
 * economy is fed by killing and its rule charges for killing, so a player who plays it correctly
 * never has the surplus to grow anything. The one growth policy that spends anyway loses three
 * hundred boards for it. No constant was chosen to make that true, which is the shape a ceiling
 * would have to have to be worth adding.
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

/** `SWEEP_CASES=forearm npm run sweep:maturation` — same escape hatch as the balance sweep. */
const ONLY = process.env.SWEEP_CASES?.split(',').map((id) => id.trim()).filter((id) => id !== '');

interface SweepCase {
  readonly caseId: CaseId;
  /** Days elapsed when a clean run meets this case — what both unlock schedules read now. */
  readonly daysElapsed: number;
}

const SWEEP: readonly SweepCase[] = CASES
  .map((definition, index) => ({ caseId: definition.id, daysElapsed: index }))
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
  /**
   * True when at least one kind this run grows has opened by this case's `daysElapsed` —
   * `maturationOffer` (`stats.ts`) now refuses to grow a kind before its `MaturedForm.unlock`
   * days have passed, the same season gate `unlockedKinds` applies to placement. A run swept
   * against a case earlier than every one of its kinds' unlocks can never reach the board with a
   * growable cell, which is the schedule working as intended and not a harness that stopped
   * measuring anything. See the skip logged in `compareCase` and the trap assertion below, which
   * only holds a run to growing something when `eligible` is true.
   */
  readonly eligible: boolean;
}

/**
 * The kinds a run would actually be offered to grow at this `daysElapsed` — the intersection of
 * what the run is willing to grow with what the season has opened. Kept separate from
 * `unlockedKinds` in `playBoard.ts`, which answers the *placement* question (can this kind be
 * bought at all); this answers the *growth* one, gated by `MaturedForm.unlock` rather than
 * `DefenderStats.unlock`, and the two schedules are not the same — every kind here is already
 * buyable from day one.
 */
function openKindsFor(run: Run, daysElapsed: number): readonly DefenderKind[] {
  return run.kinds.filter((kind) => {
    const form = maturedFormOf(kind);
    return form !== null && daysElapsed >= form.unlock;
  });
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

function compareCase({ caseId, daysElapsed }: SweepCase): CaseComparison {
  const definition = CASES.find((c) => c.id === caseId);
  if (definition === undefined) throw new Error(`Unknown case ${caseId}`);

  const tallies = RUNS.map(() => emptyTally());
  let boards = 0;
  let best = 0;

  for (const board of everyBoard(unlockedKinds(daysElapsed), definition.spots.length)) {
    boards += 1;

    // Every run is played before anything is counted, so `helped` and `hurt` compare against the
    // baseline rather than against whichever run the loop happened to reach first.
    const outcomes = RUNS.map(
      (run) => playBoard(caseId, daysElapsed, board, run.policy, run.kinds),
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

  const runs = RUNS.map((run, index) => {
    const eligible = run.policy === 'never' || openKindsFor(run, daysElapsed).length > 0;
    if (!eligible) {
      // Not a truncation the reader is meant to take on faith: every pair the trap assertion
      // will not hold to "grew something" is named here, with the unlock that excluded it, so a
      // narrower comparison still reads as covering everything it claims to.
      const unlocks = run.kinds
        .map((kind) => `${kind}:${String(maturedFormOf(kind)?.unlock ?? '—')}`)
        .join(', ');
      console.log(`  skipping ${caseId}/${run.label} — none of [${unlocks}] has opened by day ${String(daysElapsed + 1)}`);
    }
    return { run, eligible, ...(tallies[index] ?? emptyTally()) };
  });
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
   *
   * Only over `eligible` pairs, though. Growth used to be available from day one; it is now a
   * season unlock (`MaturedForm.unlock` in `maturation.ts`, enforced by `maturationOffer` in
   * `stats.ts`), so a case swept before every kind a run grows has opened cannot put a grown cell
   * on the board no matter how well the run plays it — that is the schedule doing its job, not
   * the trap this assertion exists to catch. Forearm on day 1, at zero days elapsed, can never
   * grow a macrophage (unlock 4) or an antibody (unlock 6); asserting `grown > 0` there would be
   * asserting the gate is a bug. `compareCase` logs every pair this excludes and why, so skipping
   * here is never silent.
   */
  it('grows cells under the growing runs and none under never', () => {
    for (const comparison of comparisons) {
      for (const result of comparison.runs) {
        if (result.run.policy === 'never') {
          expect(result.grown, `${comparison.caseId} grew a cell under never`).toBe(0);
        } else if (result.eligible) {
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
   *
   * **There is no exception list, deliberately.** One used to sit above this suite holding the
   * fibrin mesh, on the reasoning that a permanently red check decays into wallpaper. The mesh
   * turned out not to be tunable at all — every stat a clot has is the same currency, so no pricing
   * of it was ever going to pass — and the answer was to delete the form rather than keep excusing
   * it. A form that cannot pass this is a form that should not be sold, and an opt-out is how the
   * next one that cannot pass stays on the dock anyway. Add the list back only for a form that has
   * a reason to be red *and* a date it stops being red.
   */
  it('never offers a growth that is not worth having — every form wins more than it loses', () => {
    // Every form is judged before anything is asserted, and the failure names all of them. One
    // `expect` per kind would stop at the first, and this run costs eleven minutes — finding the
    // second bad form should not cost eleven more.
    const failures: string[] = [];
    for (const { kind, helped, hurt, perCase } of EVERY_GROWABLE.map(seasonTotal)) {
      if (helped > hurt) continue;
      failures.push(`growing only ${kind} wins ${String(helped)} boards across the season and loses ${String(hurt)} (${perCase.join(', ')})`);
    }

    // The scope is named, because `SWEEP_CASES` narrows it. Summed over one case this is the
    // per-case bar the docstring above explains why we do not want, and a reader who narrowed the
    // run needs to see that in the failure rather than conclude a form regressed.
    const scope = comparisons.map((comparison) => comparison.caseId).join(' + ');
    expect(failures, `a growth offer is not worth what it costs, over ${scope}`).toEqual([]);
  });
});
