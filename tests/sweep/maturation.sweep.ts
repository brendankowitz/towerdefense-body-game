import { beforeAll, describe, expect, it } from 'vitest';
import { CASES } from '../../src/game/content/cases';
import type { CaseId } from '../../src/game/types';
import { everyBoard, playBoard, unlockedKinds, type MaturationPolicy } from './playBoard';

/**
 * THE MATURATION COMPARISON. Not part of `npm test`, and not part of `npm run sweep` either — it
 * plays the whole board space three times over and takes three times the minutes.
 *
 *   npm run sweep:maturation
 *
 * `balance.sweep.ts` measures a player who buys and never grows, and used to justify that with
 * the claim that maturing "can only help", so its rate was a floor. That was an argument. This
 * run is the measurement: the same boards, the same simulation, three maturation policies, and a
 * count of which boards change hands in which direction.
 *
 * Two questions, and this is what answers each:
 *
 * - **Does maturing help or hurt?** The per-policy rate says it on aggregate, and `helped` /
 *   `hurt` say it per board — an aggregate that barely moves can still be a hundred boards won
 *   and a hundred lost, which is a different fact about the game.
 * - **Is the reported rate really a floor?** It is, but not for the reason the old docstring
 *   gave. Maturing is *optional*: a player who declines it plays the buy-only policy exactly, so
 *   best play is at least that good whatever growth does. `best` — boards that clear under any of
 *   the three policies — is how much room is left above the floor, and the gap between it and
 *   `never` is how loose the floor is.
 *
 * What it said on 2026-07-26, against the tuning of that day:
 *
 *   forearm   never  283/3125 ( 9.1%)   surplus  421 (13.5%) +167/-29    eager  297 ( 9.5%) +164/-150
 *   throat    never  486/7776 ( 6.3%)   surplus   30 ( 0.4%)   +5/-461   eager   17 ( 0.2%)   +4/-473
 *   stomach   never  424/7776 ( 5.5%)   surplus  146 ( 1.9%)  +91/-369   eager   88 ( 1.1%)  +59/-395
 *   best of the three: forearm 502 (16.1%), throat 491 (6.3%), stomach 531 (6.8%)
 *
 * **Maturing everything you can afford is a rout on two cases of three.** Not because it starves
 * the board — `'surplus'` never takes a cell off the board to pay for a growth and still loses
 * 461 of throat's 486 winning boards — but because the forms are trades and the trade is
 * case-shaped. Forearm ends on armoured bodies, which is what a macrophage's appetite and bite
 * are for; throat's rule splits every dead virus into two more, which is a stream, and a
 * macrophage that rests twice as long and an antibody that re-marks half as often are both on the
 * wrong side of a stream. That is one reading of an aggregate and this run does not decompose it
 * per cell — what it does establish is the direction, and that the direction is not the same in
 * every case.
 *
 * So the floor holds and the old reason for it does not. It holds because maturing is optional.
 * The `best` column says how much is above it: 16.1% on forearm against a band whose ceiling is
 * 15%, which is a fact about forearm and not about this harness.
 *
 * The shape of this run is a policy per board rather than a cross-product over which cells to
 * grow. The cross-product is ~8× more runs (2^growable-spots, which averages three of five
 * spots), it still would not be best play because it fixes *when* each cell grows, and the extra
 * precision does not change a decision: what a tuning needs to know is the direction and the
 * rough size of the effect.
 */

/** `'never'` is the baseline the other two are counted against, so it is not optional here. */
const POLICIES: readonly MaturationPolicy[] = ['never', 'surplus', 'eager'];

/** `SWEEP_CASES=forearm npm run sweep:maturation` — same escape hatch as the balance sweep. */
const ONLY = process.env.SWEEP_CASES?.split(',').map((id) => id.trim()).filter((id) => id !== '');

interface SweepCase {
  readonly caseId: CaseId;
  readonly clearedCount: number;
}

const SWEEP: readonly SweepCase[] = CASES
  .map((definition, index) => ({ caseId: definition.id, clearedCount: index }))
  .filter(({ caseId }) => ONLY === undefined || ONLY.includes(caseId));

interface PolicyResult {
  readonly policy: MaturationPolicy;
  readonly clears: number;
  readonly stalls: number;
  /** Cells grown across every board of the case. Zero for `'never'`, by construction. */
  readonly grown: number;
  /** Boards this policy clears that `'never'` loses. */
  readonly helped: number;
  /** Boards this policy loses that `'never'` clears. */
  readonly hurt: number;
}

interface CaseComparison {
  readonly caseId: CaseId;
  readonly boards: number;
  readonly policies: readonly PolicyResult[];
  /** Boards that clear under at least one policy — the ceiling these three policies reach. */
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

  const tallies: Record<MaturationPolicy, Tally> = {
    never: emptyTally(), surplus: emptyTally(), eager: emptyTally(),
  };
  let boards = 0;
  let best = 0;

  for (const board of everyBoard(unlockedKinds(clearedCount), definition.spots.length)) {
    boards += 1;

    // Every policy is played before anything is counted, so `helped` and `hurt` compare against
    // the baseline rather than against whichever policy the loop happened to reach first.
    const outcomes = POLICIES.map(
      (policy) => ({ policy, outcome: playBoard(caseId, clearedCount, board, policy) }),
    );
    const baseline = outcomes.find(({ policy }) => policy === 'never')?.outcome;
    if (baseline === undefined) throw new Error('the comparison has no never policy to compare to');

    for (const { policy, outcome } of outcomes) {
      const tally = tallies[policy];
      if (outcome.cleared) tally.clears += 1;
      if (outcome.cleared && !baseline.cleared) tally.helped += 1;
      if (!outcome.cleared && baseline.cleared) tally.hurt += 1;
      if (outcome.stalled) tally.stalls += 1;
      tally.grown += outcome.grown;
    }

    if (outcomes.some(({ outcome }) => outcome.cleared)) best += 1;
  }

  const policies = POLICIES.map((policy) => ({ policy, ...tallies[policy] }));
  return { caseId, boards, policies, best };
}

function rate(clears: number, boards: number): string {
  return `${((clears / boards) * 100).toFixed(1)}%`;
}

function report(comparison: CaseComparison): string {
  const lines = comparison.policies.map((result) => [
    `  ${result.policy.padEnd(7)}`,
    `${String(result.clears).padStart(5)}/${String(comparison.boards)} clear (${rate(result.clears, comparison.boards).padStart(5)})`,
    `+${String(result.helped)} won / -${String(result.hurt)} lost vs never`,
    `${String(result.grown)} cells grown`,
  ].join('  |  '));

  return [
    `${comparison.caseId} — ${String(comparison.boards)} boards`,
    ...lines,
    `  best of the three: ${String(comparison.best)} (${rate(comparison.best, comparison.boards)})`,
  ].join('\n');
}

describe('maturation comparison', () => {
  let comparisons: readonly CaseComparison[] = [];

  beforeAll(() => {
    comparisons = SWEEP.map(compareCase);
    for (const comparison of comparisons) console.log(report(comparison));
  });

  it('never stalls a wave under any policy — growing a cell must not hang a run', () => {
    for (const comparison of comparisons) {
      for (const result of comparison.policies) {
        expect(
          result.stalls,
          `${comparison.caseId}/${result.policy} stalled ${String(result.stalls)} runs`,
        ).toBe(0);
      }
    }
  });

  /**
   * Without this the whole run could be three identical passes and every number above would agree
   * beautifully about nothing. `'never'` is asserted from the same field, so a policy that has
   * quietly stopped being distinguishable fails here rather than reporting a null result.
   */
  it('grows cells under the growing policies and none under never', () => {
    for (const comparison of comparisons) {
      for (const result of comparison.policies) {
        if (result.policy === 'never') {
          expect(result.grown, `${comparison.caseId} grew a cell under never`).toBe(0);
        } else {
          expect(
            result.grown,
            `${comparison.caseId}/${result.policy} grew nothing — the policy is not reaching the board`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });
});
