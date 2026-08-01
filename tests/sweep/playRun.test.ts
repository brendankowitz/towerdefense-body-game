import { beforeAll, describe, expect, it } from 'vitest';
import { CASE_REGIONS } from '../../src/game/content/body';
import {
  CASE_POLICIES, FIGHT_POLICIES, MAX_RUN_DAYS, playRun,
  type CasePolicy, type RunOutcome,
} from './playRun';

/**
 * The run harness's own tests. `runSweep.ts` asserts what the season is worth and takes minutes;
 * these assert that the instrument works at all, and belong to `npm test`.
 *
 * **What the plan asked for here and what is asserted instead.** The brief for this file wanted
 * "every run ends, one way or the other". That turned out to be a claim about the content rather
 * than about the harness, and a false one: under the `'learned'` fight policy a player who wins
 * every fight empties the board every evening, the sickness never has ground to step from, and no
 * run ever ends at any value of the three pacing constants — the reasoning is written out in
 * `playRun.ts`. Under `'learning'` about one run in seven still reaches the day ceiling holding nine
 * of the ten regions, because the three regions with no door can only catch fire by spread and a
 * player who has stopped losing never gives the sickness the day it needs to spread. Asserting the
 * false version would have meant tuning until a red test went green, which is exactly the
 * number-picking this task exists to stop.
 *
 * So the share of runs that never resolve is a **reported** number — `runSweep.ts` prints it beside
 * everything else it cannot honestly gate — and what is asserted here is what the harness itself
 * promises: it always terminates, it always says which of the three things happened, a seed replays
 * identically, and no run can change what another one measures.
 *
 * **Every assertion reads one shared pass.** A run costs somewhere over a second — most of it the
 * board search behind `'learning'` — so a file that played its own seeds per test would cost the
 * suite minutes to say six things about the same fourteen runs. `RUNS` is played once in
 * `beforeAll`; the two tests that cannot use it say why.
 */

/**
 * Seeds 1 to 7, and the number is not round. It is the shortest prefix that produces all three
 * results under `nearestToCore` — 1, 2 and 6 win, 3, 4 and 5 lose at the core, 7 is still going at
 * the ceiling — so the assertions below are about an instrument that demonstrably does all three
 * rather than about one that happened not to be asked.
 */
const SEEDS = 7;

const seeds = Array.from({ length: SEEDS }, (_unused, index) => index + 1);

interface Played {
  readonly seed: number;
  readonly policy: CasePolicy;
  readonly outcome: RunOutcome;
}

let RUNS: readonly Played[] = [];

/**
 * The suite's default 5 seconds is a budget for a unit test, and every play below is a real season
 * on the real step loop. Stated per hook and per test rather than raised for the whole file, so the
 * three places that are allowed to cost seconds are the three places that say so.
 */
const PLAY_BUDGET = 120_000;

beforeAll(() => {
  RUNS = CASE_POLICIES.flatMap((policy) =>
    seeds.map((seed) => ({ seed, policy, outcome: playRun(seed, policy, 'learning') })));
}, PLAY_BUDGET);

describe('playRun', () => {
  it('always terminates, and says which of the three things happened', () => {
    for (const { seed, outcome } of RUNS) {
      expect(['won', 'lost', 'unfinished']).toContain(outcome.result);
      expect(
        outcome.stalled,
        `run ${String(seed)} is ${outcome.result} and stalled is ${String(outcome.stalled)}`,
      ).toBe(outcome.result === 'unfinished');
      expect(outcome.days).toBeLessThanOrEqual(MAX_RUN_DAYS + 1);
    }
  });

  /**
   * An instrument that ended nothing would measure nothing, and one that ended everything the same
   * way would measure nothing either. Asserted over named seeds rather than as a share of a large
   * sample, because a share is a claim about the content and would move with any tuning — what has
   * to hold here is only that all three endings are reachable through this harness at all.
   */
  it('reaches all three endings under the policy a person plays', () => {
    const results = new Set(RUNS
      .filter(({ policy }) => policy === 'nearestToCore')
      .map(({ outcome }) => outcome.result));
    expect([...results].sort()).toEqual(['lost', 'unfinished', 'won']);
  });

  it('only calls a run won with every region held, and only lost at the core', () => {
    for (const { seed, outcome } of RUNS) {
      if (outcome.result === 'won') {
        expect(outcome.held, `run ${String(seed)} won without holding the body`)
          .toBe(CASE_REGIONS.length);
      }
      if (outcome.result === 'lost') {
        expect(outcome.lostAtCore, `run ${String(seed)} was lost somewhere other than the core`)
          .toBe(true);
      }
      expect(outcome.held).toBeLessThanOrEqual(outcome.cleared);
      expect(outcome.cleared).toBeLessThanOrEqual(CASE_REGIONS.length);
    }
  });

  it('never reaches the last stand without the sickness having stood on the core', () => {
    for (const { outcome } of RUNS) {
      if (outcome.lastStands > 0) expect(outcome.reachedCore).toBe(true);
      if (outcome.coreArrival === null) expect(outcome.lastStands).toBe(0);
    }
  });

  /**
   * One day per distinct clear, in the order they landed, and never a day the run had not reached.
   * `gateReport` indexes this list to say when a vaccine gate was crossed, so a clear recorded on
   * the wrong day or a retaken region recorded twice would silently move a measurement rather than
   * fail anything.
   */
  it('records one day per distinct clear, in order', () => {
    for (const { seed, outcome } of RUNS) {
      expect(outcome.clearDays.length, `run ${String(seed)} counted its clears twice`)
        .toBe(outcome.cleared);
      const ascending = [...outcome.clearDays].sort((a, b) => a - b);
      expect(outcome.clearDays).toEqual(ascending);
      for (const day of outcome.clearDays) expect(day).toBeLessThanOrEqual(outcome.days);
    }
  });

  /** Its own plays: what is being asserted is that a second play of a seed matches the first. */
  it('replays a seed identically, so a measurement is a measurement', () => {
    expect(playRun(4, 'nearestToCore')).toEqual(playRun(4, 'nearestToCore'));
    expect(playRun(4, 'cheapest', 'learning')).toEqual(playRun(4, 'cheapest', 'learning'));
  }, PLAY_BUDGET);

  /**
   * Its own plays, and the only test here that touches all three fight policies. The memo in
   * `learnedBoard` is keyed on the fight's context, and a key missing a field would show up first as
   * one run being contaminated by another — runs meet the same cases on different days, at different
   * immunity, in a different order. Playing the same seed in both orders proves the order they were
   * played in cannot change what any of them reports.
   */
  it('does not let one run change what another one measures', () => {
    const forwards = FIGHT_POLICIES.map((fight) => playRun(7, 'nearestToCore', fight));
    const backwards = [...FIGHT_POLICIES]
      .reverse()
      .map((fight) => playRun(7, 'nearestToCore', fight))
      .reverse();
    expect(forwards).toEqual(backwards);
  }, PLAY_BUDGET);
});
