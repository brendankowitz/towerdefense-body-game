import { beforeAll, describe, expect, it } from 'vitest';
import { CASES } from '../../src/game/content/cases';
import {
  ARRIVALS_ENABLED, ARRIVAL_USES, IMMUNITY_MAX, KILLER_DAMAGE, KILLER_MIX_CHANCE,
  MOUNT_CLUSTER_RADIUS, RECOGNITION_PER_CALL, RESPONSE_PER_CLEAR,
} from '../../src/game/content/rules';
import type { CaseId, StrainId } from '../../src/game/types';
import {
  EVERY_GROWABLE, everyBoard, playBoardIn, unlockedKinds, type ArrivalPolicy,
} from './playBoard';

/**
 * THE MEMORY COMPARISON. Not part of `npm test`, and not part of any other sweep either — it
 * plays the whole board space four times over and takes minutes.
 *
 *   npm run sweep:arrivals
 *
 * `balance.sweep.ts` measures a board and `maturation.sweep.ts` measures a decision the player
 * makes on one. This measures what the player brings *to* one: the memory a profile earned by
 * beating a strain before, and the help that memory sends when the strain turns up again. It is
 * the instrument the seven constants of the memory response are chosen against — a balance number
 * in this repo is measured, never chosen — and it is the thing that had to exist before
 * `ARRIVALS_ENABLED` could be turned on, because every one of the eleven rates in `cases.ts` was
 * measured with it off.
 *
 * ---
 *
 * **What `'none'` means here, and what that choice cost.**
 *
 * `'none'` zeroes every strain before the simulation sees it. It is not "arrivals off": arrivals
 * are gated by a module constant, and a harness that wanted them off in one arm and on in another
 * inside one process would have to teach `src/game/` that a sweep exists. Zeroing the memory is
 * the lever the harness already has, and it is the game's own rule rather than a second one —
 * `noteRecognition` banks nothing for a strain at zero, so "no memory, no response" is stated once
 * and this arm simply asks for it. `ArrivalPolicy` in `playBoard.ts` carries the full argument.
 *
 * The cost is the vaccine, and it lands on exactly one column. The three strain vaccines fire at
 * `IMMUNITY_MAX`, so:
 *
 * - **memory 1 and memory 2** — nothing but `noteRecognition` and `callArrivals` reads
 *   `state.immunity` below `IMMUNITY_MAX`. Every other reader in the simulation — the tetanus
 *   bounce in `applySpawn`, Flu B in `resolveDeaths`, the serum in `armourMultiplier` — is a
 *   `>= IMMUNITY_MAX` test. So the difference in these two columns is **the response and nothing
 *   else**, and this run proves it rather than asserting it: with `ARRIVALS_ENABLED` off these two
 *   columns must come out identical to the baseline, board for board, which is the mutation the
 *   control run below watches fail.
 * - **memory 3** — the baseline has no vaccine either, so this column is **the response and all
 *   three vaccines together**. It is labelled that way on every line it appears on. To read the
 *   response out of it, run this file twice: once with `ARRIVALS_ENABLED` off, which measures the
 *   vaccines alone, and once with it on. The difference of the two memory-3 columns is the
 *   response at full memory, exactly — both runs enumerate the same finite board space on a
 *   deterministic simulation, so neither number carries sampling error.
 *
 * The two killer dials are not measured that way and do not need to be. `arrivalKindFor` sends a
 * killer only at `IMMUNITY_MAX`, so both live at memory 3 — but a *spread* of `KILLER_MIX_CHANCE`
 * or `KILLER_DAMAGE` at fixed memory 3 holds all three vaccines constant across the spread, so
 * what a step of either is worth is clean without any subtraction.
 *
 * ---
 *
 * **How a spread is swept.** There is no injection machinery here and there should not be. The
 * precedent is `OUTBREAK_INTERVAL`, `SIEGE_BASE_DAYS` and `DOOR_RESIST_PER_CLEAR` in `rules.ts`:
 * the header below echoes every live constant this run was measured under, the operator edits the
 * constant, re-runs, and records what a step was worth beside the constant it moved. The header is
 * what makes a pasted report impossible to misread as belonging to a tuning it does not — which
 * includes `ARRIVALS_ENABLED` itself, since half the runs this file is built for have it off.
 */

/**
 * One measured state of memory. The baseline is not optional: `helped` and `hurt` are counted
 * against it, and a comparison with nothing to compare to is a table of rates.
 *
 * Memory is set on **all three strains at once** rather than on the strain the case credits, for
 * the reason `band.ts` records from the run sweep: a case sends more than its own strain — forearm
 * sends staph and film, throat sends virus and film — so crediting one strain leaves half the
 * vessel unable to bank a recognition, and one strain at its cap was measured to be worth nothing
 * on the last stand where three of them are worth a great deal. Setting all three asks the
 * question a player would recognise: what is it worth to have been here before.
 */
interface Arm {
  readonly label: string;
  readonly policy: ArrivalPolicy;
  /** Immunity on every strain. Zero only for the baseline, which is what `'none'` produces. */
  readonly memory: number;
  /** What is inside a difference measured against the baseline. Printed on every line. */
  readonly contains: string;
}

const ARMS: readonly Arm[] = [
  { label: 'no memory', policy: 'none', memory: 0, contains: 'baseline' },
  { label: 'memory 1', policy: 'earned', memory: 1, contains: 'response only' },
  { label: 'memory 2', policy: 'earned', memory: 2, contains: 'response only' },
  { label: 'memory 3', policy: 'earned', memory: 3, contains: 'response + all 3 vaccines' },
];

const BASELINE = 0;

/** `SWEEP_CASES=forearm npm run sweep:arrivals` — the same escape hatch the other three offer. */
const ONLY = process.env.SWEEP_CASES?.split(',').map((id) => id.trim()).filter((id) => id !== '');

interface SweepCase {
  readonly caseId: CaseId;
  /** Days elapsed when a clean run meets this case — what decides which cells the dock offers. */
  readonly daysElapsed: number;
}

const SWEEP: readonly SweepCase[] = CASES
  .map((definition, index) => ({ caseId: definition.id, daysElapsed: index }))
  .filter(({ caseId }) => ONLY === undefined || ONLY.includes(caseId));

const IS_WHOLE_SEASON = SWEEP.length === CASES.length;

function memoryOf(level: number): Readonly<Record<StrainId, number>> {
  return { staph: level, film: level, virus: level };
}

interface Tally {
  clears: number;
  stalls: number;
  /** Boards this arm clears that the baseline loses. */
  helped: number;
  /** Boards this arm loses that the baseline clears. */
  hurt: number;
  /**
   * Of the boards this arm won, how many the baseline lost on the case's **last** wave.
   *
   * The second half of the target, and the only part of it that is a measurement rather than a
   * preference: help should be finishing boards that were nearly finished, not carrying boards
   * that were never in it. A board the baseline lost on wave 1 and this arm cleared is help doing
   * the player's job for them; a board the baseline lost on wave 5 of 5 is help closing a gap the
   * player had already played their way to.
   */
  helpedOnLastWave: number;
  standing: number;
  standingKillers: number;
}

function emptyTally(): Tally {
  return {
    clears: 0, stalls: 0, helped: 0, hurt: 0, helpedOnLastWave: 0, standing: 0, standingKillers: 0,
  };
}

interface CaseComparison {
  readonly caseId: CaseId;
  readonly credits: StrainId;
  readonly mounts: number;
  readonly waves: number;
  readonly boards: number;
  readonly tallies: readonly Tally[];
}

function compareCase({ caseId, daysElapsed }: SweepCase): CaseComparison {
  const definition = CASES.find((c) => c.id === caseId);
  if (definition === undefined) throw new Error(`Unknown case ${caseId}`);

  const tallies = ARMS.map(() => emptyTally());
  let boards = 0;

  for (const board of everyBoard(unlockedKinds(daysElapsed), definition.spots.length)) {
    boards += 1;

    // Every arm is played before anything is counted, so `helped` and `hurt` compare against the
    // baseline rather than against whichever arm the loop reached first.
    const outcomes = ARMS.map((arm) => playBoardIn({
      caseId,
      immunity: memoryOf(arm.memory),
      // Day and case index track each other one for one, the same schedule `playBoard` walks.
      day: daysElapsed + 1,
      blocksAmnesia: false,
      arrivals: arm.policy,
    }, board, 'never', EVERY_GROWABLE));

    const baseline = outcomes[BASELINE];
    if (baseline === undefined) throw new Error('the comparison has no baseline to compare to');

    outcomes.forEach((outcome, index) => {
      const tally = tallies[index];
      if (tally === undefined) return;
      if (outcome.cleared) tally.clears += 1;
      if (outcome.stalled) tally.stalls += 1;
      if (outcome.cleared && !baseline.cleared) {
        tally.helped += 1;
        if (baseline.lastWave === definition.waves.length) tally.helpedOnLastWave += 1;
      }
      if (!outcome.cleared && baseline.cleared) tally.hurt += 1;
      tally.standing += outcome.standing;
      tally.standingKillers += outcome.standingKillers;
    });
  }

  return {
    caseId,
    credits: definition.credits,
    mounts: definition.mounts.length,
    waves: definition.waves.length,
    boards,
    tallies,
  };
}

function rate(clears: number, boards: number): string {
  return `${((clears / boards) * 100).toFixed(1)}%`;
}

/** The difference this arm makes to the case's clear rate, in points, signed. */
function delta(tally: Tally, baseline: Tally, boards: number): string {
  const points = ((tally.clears - baseline.clears) / boards) * 100;
  return `${points >= 0 ? '+' : ''}${points.toFixed(1)}pp`;
}

function report(comparison: CaseComparison): string {
  const width = Math.max(...ARMS.map((arm) => arm.label.length));
  const baseline = comparison.tallies[BASELINE] ?? emptyTally();

  const lines = comparison.tallies.map((tally, index) => {
    const arm = ARMS[index];
    if (arm === undefined) return '';
    const cells = [
      `  ${arm.label.padEnd(width)}`,
      `${String(tally.clears).padStart(5)}/${String(comparison.boards)} clear (${rate(tally.clears, comparison.boards).padStart(5)})`,
      index === BASELINE
        ? 'baseline'.padEnd(38)
        : `${delta(tally, baseline, comparison.boards).padStart(6)}  +${String(tally.helped)} won (${String(tally.helpedOnLastWave)} on the last wave) / -${String(tally.hurt)} lost`.padEnd(38),
      `${String(tally.standing).padStart(6)} standing, ${String(tally.standingKillers)} killers`,
      arm.contains,
    ];
    return cells.join('  |  ');
  });

  return [
    `${comparison.caseId} (credits ${comparison.credits}, ${String(comparison.mounts)} mounts, ${String(comparison.waves)} waves) — ${String(comparison.boards)} boards`,
    ...lines,
  ].join('\n');
}

/** The season summed, which is the row every constant below is actually chosen against. */
function seasonReport(comparisons: readonly CaseComparison[]): string {
  const width = Math.max(...ARMS.map((arm) => arm.label.length));
  const boards = comparisons.reduce((total, c) => total + c.boards, 0);
  const totals = ARMS.map((_arm, index) => comparisons.reduce((sum, c) => {
    const tally = c.tallies[index] ?? emptyTally();
    return {
      clears: sum.clears + tally.clears,
      stalls: sum.stalls + tally.stalls,
      helped: sum.helped + tally.helped,
      hurt: sum.hurt + tally.hurt,
      helpedOnLastWave: sum.helpedOnLastWave + tally.helpedOnLastWave,
      standing: sum.standing + tally.standing,
      standingKillers: sum.standingKillers + tally.standingKillers,
    };
  }, emptyTally()));

  const baseline = totals[BASELINE] ?? emptyTally();
  const lines = totals.map((tally, index) => {
    const arm = ARMS[index];
    if (arm === undefined) return '';
    return [
      `  ${arm.label.padEnd(width)}`,
      `${String(tally.clears).padStart(6)}/${String(boards)} clear (${rate(tally.clears, boards).padStart(5)})`,
      index === BASELINE
        ? 'baseline'.padEnd(40)
        : `${delta(tally, baseline, boards).padStart(6)}  +${String(tally.helped)} won (${String(tally.helpedOnLastWave)} on the last wave) / -${String(tally.hurt)} lost`.padEnd(40),
      `${String(tally.standing).padStart(7)} standing, ${String(tally.standingKillers)} killers`,
      arm.contains,
    ].join('  |  ');
  });

  return ['SEASON', ...lines].join('\n');
}

function header(): string {
  const mounts = CASES.map((c) => `${c.id} ${String(c.mounts.length)}`).join(', ');
  return [
    'ARRIVALS SWEEP — what memory is worth on a board',
    `  ARRIVALS_ENABLED ${String(ARRIVALS_ENABLED)}${ARRIVALS_ENABLED ? '' : '  <<< CONTROL RUN: every memory column below is the vaccines alone'}`,
    `  RECOGNITION_PER_CALL ${String(RECOGNITION_PER_CALL)}  |  RESPONSE_PER_CLEAR ${String(RESPONSE_PER_CLEAR)}  |  ARRIVAL_USES ${String(ARRIVAL_USES)}`,
    `  KILLER_MIX_CHANCE ${String(KILLER_MIX_CHANCE)}  |  KILLER_DAMAGE ${String(KILLER_DAMAGE)}  |  IMMUNITY_MAX ${String(IMMUNITY_MAX)}  |  MOUNT_CLUSTER_RADIUS ${String(MOUNT_CLUSTER_RADIUS)}`,
    `  mounts per case: ${mounts}`,
  ].join('\n');
}

/**
 * Everything this run is not covering, named. The rule is `maturation.sweep.ts`'s and it is the
 * one thing a comparison owes a reader who is going to paste its output into a tuning note: a
 * narrowed run and a whole one look identical once the numbers are out of the terminal.
 */
function skips(): readonly string[] {
  const lines: string[] = [];
  if (!IS_WHOLE_SEASON) {
    const missing = CASES.map((c) => c.id).filter((id) => !SWEEP.some((s) => s.caseId === id));
    lines.push(`  skipping ${String(missing.length)} of ${String(CASES.length)} cases — ${missing.join(', ')} (SWEEP_CASES is set); this is a working run and not evidence for a tuning`);
  }
  if (!ARRIVALS_ENABLED) {
    lines.push('  skipping the landing and the worth assertions — ARRIVALS_ENABLED is off, so no call can be answered and every difference below is a vaccine');
  }
  lines.push(`  not swept: MOUNT_CLUSTER_RADIUS (${String(MOUNT_CLUSTER_RADIUS)}) — nothing reads it at runtime; it is the bound content.invariants.test.ts holds authored mounts inside, so moving it measures nothing until eleven boards are re-authored against the new bound`);
  return lines;
}

describe('memory response comparison', () => {
  let comparisons: readonly CaseComparison[] = [];

  beforeAll(() => {
    console.log(header());
    for (const line of skips()) console.log(line);
    comparisons = SWEEP.map(compareCase);
    for (const comparison of comparisons) console.log(report(comparison));
    console.log(seasonReport(comparisons));
  });

  function totalOf(index: number, pick: (tally: Tally) => number): number {
    return comparisons.reduce((sum, c) => sum + pick(c.tallies[index] ?? emptyTally()), 0);
  }

  it('never stalls a wave under any arm — help arriving must not hang a run', () => {
    for (const comparison of comparisons) {
      comparison.tallies.forEach((tally, index) => {
        expect(
          tally.stalls,
          `${comparison.caseId}/${ARMS[index]?.label ?? '?'} stalled ${String(tally.stalls)} runs`,
        ).toBe(0);
      });
    }
  });

  /**
   * Without this the whole run could be four identical passes and every number above would agree
   * beautifully about nothing — the same trap `maturation.sweep.ts` guards with `grown > 0`, and
   * the same shape of guard, asserted from the field the report prints.
   *
   * The baseline half holds whatever the flag says, because it is the claim `'none'` makes about
   * itself: a strain at zero banks no recognition, so no call is ever rolled and nothing can land.
   * The other half is only asked with the feature on — with it off no call can be answered at all,
   * which is the control run working rather than a comparison that stopped measuring, and `skips`
   * says so on the run's own output.
   */
  it('lands help under every memory arm and none at all under no memory', () => {
    expect(totalOf(BASELINE, (tally) => tally.standing), 'help arrived where there was no memory').toBe(0);
    if (!ARRIVALS_ENABLED) return;

    const silent = ARMS
      .map((arm, index) => ({ arm, index }))
      .filter(({ index }) => index !== BASELINE)
      .filter(({ index }) => totalOf(index, (tally) => tally.standing) === 0)
      .map(({ arm }) => `${arm.label} never had an arrival standing anywhere in the season — the arm is not reaching the board`);

    expect(silent, 'a memory arm never received help').toEqual([]);
  });

  /**
   * Killers exist only at full memory, and this is what says so from the measurement rather than
   * from `arrivalKindFor`'s source. A tuning that let a killer through at memory 1 or 2 would be a
   * free execute on a board the player has beaten the strain on once, which is the scarcity the
   * whole game is priced on.
   *
   * **One-sided, and the report says so too.** `standingKillers` undercounts (see `BoardOutcome`),
   * so a zero here is weaker evidence than a zero usually is. It is kept because it is free and
   * because a regression that starts sending killers early would send tens of thousands of them
   * across 66,600 boards and could not hide inside the undercount. The unbiased version of this
   * statement is not an assertion at all: sweep `KILLER_MIX_CHANCE` from 0 to 1 and the memory-1
   * and memory-2 clear counts do not move by a single board, which is the reading recorded in
   * `rules.ts`.
   */
  it('sends a killer only at full memory', () => {
    if (!ARRIVALS_ENABLED) return;
    ARMS.forEach((arm, index) => {
      if (arm.policy === 'none' || arm.memory >= IMMUNITY_MAX) return;
      expect(
        totalOf(index, (tally) => tally.standingKillers),
        `${arm.label} received a killer below IMMUNITY_MAX`,
      ).toBe(0);
    });
  });

  /**
   * Help has to be worth having, and it is the same statement `maturation.sweep.ts` makes of a
   * growth offer: summed over the season, take every point of memory the season hands you and you
   * must come out ahead.
   *
   * **Summed over the season, never per case, and for a sharper reason than the growth one.** A
   * mark is a trade — armour drops, the burn runs, the kill pays more, and a body that dies sooner
   * inflames the tissue sooner — so on a case whose economy is fed by killing, free marks can cost
   * a player pips they were not going to lose. That is a case-shaped trade and it is the depth the
   * mechanic is for. What is not allowed is memory being a liability across the whole season.
   *
   * Only with the feature on. With it off `helped` and `hurt` are both zero at memory 1 and 2 by
   * construction, and `0 > 0` is false — a control run must not fail for being a control run.
   */
  it('never hands a player memory that is worse than having none', () => {
    if (!ARRIVALS_ENABLED) return;
    const failures = ARMS
      .map((arm, index) => ({ arm, index }))
      .filter(({ index }) => index !== BASELINE)
      .map(({ arm, index }) => ({
        arm,
        helped: totalOf(index, (tally) => tally.helped),
        hurt: totalOf(index, (tally) => tally.hurt),
      }))
      .filter(({ helped, hurt }) => helped <= hurt)
      .map(({ arm, helped, hurt }) => `${arm.label} wins ${String(helped)} boards across the season and loses ${String(hurt)} (${arm.contains})`);

    // The scope is named because `SWEEP_CASES` narrows it, and summed over one case this is a
    // per-case bar the docstring above explains why we do not want.
    const scope = comparisons.map((c) => c.caseId).join(' + ');
    expect(failures, `memory costs a player more than it buys, over ${scope}`).toEqual([]);
  });
});
