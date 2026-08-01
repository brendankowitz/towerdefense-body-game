import { beforeAll, describe, expect, it } from 'vitest';
import { CASE_REGIONS } from '../../src/game/content/body';
import type { StrainId } from '../../src/game/types';
import type { BoardContext } from './playBoard';
import {
  CASE_POLICIES, learnedBoard, MAX_RUN_DAYS, playRun, resetLearned,
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
  /**
   * `stalled` is not asserted against `result === 'unfinished'` here, though it was: `finish` sets
   * one from the other on the same line, so the assertion restated the implementation and could not
   * go red. What can is the day ceiling, which is a claim about the loop rather than about a field.
   */
  it('always terminates, and says which of the three things happened', () => {
    for (const { seed, outcome } of RUNS) {
      expect(['won', 'lost', 'unfinished']).toContain(outcome.result);
      expect(outcome.days, `run ${String(seed)} ran past the ceiling`)
        .toBeLessThanOrEqual(MAX_RUN_DAYS + 1);
      expect(outcome.days).toBeGreaterThan(0);
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

  /**
   * The arrival is what `runSweep.ts` enumerates the heart's board space at, so a context recorded
   * from the wrong day or the wrong profile would silently move the one number the last stand is
   * tuned to. This asserts it against the run that produced it — which crosses into `progression.ts`
   * and can fail.
   *
   * What is *not* asserted any more: "a last stand implies the sickness stood on the core". Both
   * directions of that are true by construction — `reachedCore` is set from `infected.includes` at
   * the top of the same iteration that can write `coreArrival`, and the heart can only be chosen
   * when it is in `infected` — so neither clause could go red.
   */
  it('records an arrival the run could actually have made', () => {
    for (const { seed, outcome } of RUNS) {
      const arrival = outcome.coreArrival;
      if (arrival === null) {
        expect(outcome.lastStands, `run ${String(seed)} fought with no arrival recorded`).toBe(0);
        continue;
      }
      expect(arrival.day, `run ${String(seed)} arrived after it ended`)
        .toBeLessThanOrEqual(outcome.days);
      expect(arrival.cleared, `run ${String(seed)} arrived with clears it never made`)
        .toBeLessThanOrEqual(outcome.cleared);
      const earned = arrival.immunity.staph + arrival.immunity.film + arrival.immunity.virus;
      expect(earned, `run ${String(seed)} arrived with immunity no clear paid for`)
        .toBeGreaterThanOrEqual(arrival.cleared);
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

  /**
   * Its own plays, from a cleared memo both times: what is being asserted is that a second play of a
   * seed matches the first, and a second play that only re-read a cache would assert the cache.
   */
  it('replays a seed identically, so a measurement is a measurement', () => {
    resetLearned();
    const first = playRun(4, 'nearestToCore', 'learning');
    resetLearned();
    expect(playRun(4, 'nearestToCore', 'learning')).toEqual(first);
  }, PLAY_BUDGET);

  /**
   * **Two earlier versions of this test could not fail, and the second was caught by mutation.**
   *
   * The first played a seed forwards and backwards and compared; `LEARNED` is module-global, so the
   * backwards pass read what the forwards pass wrote. The second played whole *runs* against a
   * cleared memo — better, and still vacuous: reducing `contextKey` to `caseId` plus the dock size,
   * dropping immunity, the day and `blocksAmnesia`, left every test green with byte-identical
   * output. The reason is the call site. `playRun` only reads `learnedBoard(...) !== null`, and
   * whether a case is winnable *at all* barely moves across those fields — the band floor is 5%, so
   * almost every context has some winning board. A run-level assertion cannot see the difference.
   *
   * So this asserts on `learnedBoard` directly and on the **board it returns**, which does move.
   * `vesper` at day 11 finds `anti,mem,mast,mast,nk` from a cold profile and `mast,mem,phago,mem,nk`
   * from a fully immune one: same case, same day, same dock, different answer. Fill the memo from
   * one and ask for the other, and a key that has dropped immunity hands back the first board.
   *
   * **Verified by the same mutation that exposed the last version**: cut `contextKey` down to
   * `caseId` and the kinds, and this test goes red. The first assertion is what keeps it that way —
   * if a content change ever made the two immunity states agree, the test would become vacuous
   * silently, so it fails loudly instead.
   *
   * **What this does not guard, stated rather than implied.** `blocksAmnesia` is in the key and is
   * **not observable through it**: it returned an identical board on the amnesia case with film at
   * its cap at every day from 4 to 20. It is carried defensively, for the reason `learnedBoard`
   * gives — a key that omits a field because today's code ignores it starts lying the day somebody
   * uses it — and no test here can hold it to that.
   *
   * The clear count used to sit beside it in the same paragraph. It is gone from the key because it
   * is gone from `createSimState`: nothing in the simulation had read it since the unlocks moved to
   * days, so it was a dead field rather than merely an unobservable one.
   */
  it('does not let one context change what another one measures', () => {
    const at = (immunity: Readonly<Record<StrainId, number>>): BoardContext =>
      ({ caseId: 'vesper', immunity, day: 11, blocksAmnesia: false });
    const cold: Readonly<Record<StrainId, number>> = { staph: 0, film: 0, virus: 0 };
    const full: Readonly<Record<StrainId, number>> = { staph: 3, film: 3, virus: 3 };

    resetLearned();
    const aloneFull = learnedBoard(at(full));
    resetLearned();
    const aloneCold = learnedBoard(at(cold));

    expect(aloneFull, 'vesper is unwinnable at one of the two immunity states').not.toBeNull();
    expect(
      aloneCold,
      'the two immunity states now agree, so this test guards nothing — pick another case',
    ).not.toEqual(aloneFull);

    resetLearned();
    learnedBoard(at(cold));
    expect(learnedBoard(at(full)), 'the cold context answered for the immune one')
      .toEqual(aloneFull);
  }, PLAY_BUDGET);
});
