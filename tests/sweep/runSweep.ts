import { beforeAll, describe, expect, it } from 'vitest';
import { CASE_REGIONS } from '../../src/game/content/body';
import { CASE_BY_ID } from '../../src/game/content/cases';
import {
  DOOR_RESIST_PER_CLEAR, OUTBREAK_INTERVAL, SIEGE_BASE_DAYS,
} from '../../src/game/content/rules';
import { VACCINES } from '../../src/game/content/vaccines';
import { everyBoard, EVERY_GROWABLE, playBoardIn, unlockedKinds } from './playBoard';
import {
  CASE_POLICIES, FIGHT_POLICIES, MAX_RUN_DAYS, playRun,
  type CasePolicy, type CoreArrival, type FightPolicy, type RunOutcome,
} from './playRun';

/**
 * THE RUN HARNESS. Not part of `npm test` — it takes minutes.
 *
 *   npm run sweep:runs
 *
 * `balance.sweep.ts` measures a board. This measures a run: many seeds, played end to end on the
 * real front line, under every combination of the two policies a player has — which fire to fight
 * and how good they are at fighting it. What it exists for is four numbers: the three in `rules.ts`
 * — `OUTBREAK_INTERVAL`, `SIEGE_BASE_DAYS`, `DOOR_RESIST_PER_CLEAR` — and the difficulty of the
 * last stand, because all four are pacing and pacing is a property of a whole run. The rule those
 * constants answer to is the one every case in `cases.ts` answers to: a balance number is measured,
 * never chosen. All four have now been swept; what each was worth per step is written down beside
 * the constant it moved, in `rules.ts` and in the heart's entry in `cases.ts`.
 *
 * **It reports far more than it gates, and that is deliberate.** Two things are gated, because two
 * things are unambiguously broken content whatever the design intends: a season no seed can win,
 * and a season no seed can lose. Everything else — how long a run lasts, how much ground it holds,
 * how often it reaches the core — is pacing, and what counts as good pacing is an author's
 * judgement. A gate on a number nobody measured is the exact thing this harness exists to prevent,
 * so the rest is printed and the numbers are written down beside the constants they moved.
 *
 * **Runs that never end are reported, not gated, and that was a finding rather than a preference.**
 * The plan asked for a gate; the instrument then measured that under a player who wins every fight
 * *no* run ever ends, and under one who is still learning about a fifth do not either — both for
 * structural reasons `playRun.ts` writes out. A gate on that would be a gate that can only be
 * satisfied by tuning until it goes green, which is the number-picking this harness exists to
 * prevent. `unresolved` is the column; it is a real property of the season and it should be read
 * every time these numbers are.
 */

/** Seeds per policy pair. `RUN_SWEEP_SEEDS=20 npm run sweep:runs` narrows it while iterating. */
const SEEDS = Number(process.env.RUN_SWEEP_SEEDS ?? '200');

/**
 * The one fight policy the gates below are asked of, and the one every number in `rules.ts` was
 * chosen against. Named here rather than written `'learning'` at each use, so the gate and the
 * tuning cannot come to disagree about which player the season answers to.
 */
const TUNING_POLICY: FightPolicy = 'learning';

/**
 * How many distinct ways of arriving at the last stand get their board space fully enumerated.
 *
 * The heart is the one case whose difficulty a run sweep can say something about that a board
 * sweep cannot. `balance.sweep.ts` plays it at every case cleared, immunity at its cap and the full
 * dock, which is the most forgiving state any run could arrive in — and is the entry `band.ts` used
 * to exempt this case from its ceiling for. This enumerates the same 7776 boards at the day,
 * immunity and vaccines runs actually turn up with, which is what the case was retuned against and
 * what retired that exemption. That is 7776 full cases per context and a quarter of an hour, so it
 * is capped rather than run for every arrival the sweep sees; the report says how many of the
 * distinct arrivals were measured, and prints the median arrival per policy beside them so four
 * enumerated contexts can be read as representative or not.
 */
const HEART_CONTEXTS = 4;

interface RunGroup {
  readonly casePolicy: CasePolicy;
  readonly fightPolicy: FightPolicy;
  readonly outcomes: readonly RunOutcome[];
}

/**
 * Null for an empty list rather than 0, because a group with no wins and a group whose wins all
 * landed on day 0 are different facts and this used to print both as `0`. `show` is what turns the
 * distinction into something a reader sees.
 */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function show(value: number | null, width: number): string {
  return (value === null ? '—' : String(value)).padStart(width);
}

function share(outcomes: readonly RunOutcome[], predicate: (o: RunOutcome) => boolean): string {
  const count = outcomes.filter(predicate).length;
  return `${((count / outcomes.length) * 100).toFixed(0)}%`;
}

function of<T>(outcomes: readonly RunOutcome[], pick: (o: RunOutcome) => T): T[] {
  return outcomes.map(pick);
}

function groupReport(group: RunGroup): string {
  const { outcomes } = group;
  const won = outcomes.filter((o) => o.result === 'won');
  return [
    `${group.casePolicy.padEnd(14)} ${group.fightPolicy.padEnd(10)}`,
    `won ${share(outcomes, (o) => o.result === 'won').padStart(4)}`,
    `lost ${share(outcomes, (o) => o.result === 'lost').padStart(4)}`,
    `unresolved ${share(outcomes, (o) => o.stalled).padStart(4)}`,
    `days ${show(median(of(outcomes, (o) => o.days)), 4)}`,
    `days to win ${show(median(of(won, (o) => o.days)), 4)}`,
    `held ${show(median(of(outcomes, (o) => o.held)), 3)}/${String(CASE_REGIONS.length)}`,
    `cleared ${show(median(of(outcomes, (o) => o.cleared)), 3)}`,
    `core reached ${share(outcomes, (o) => o.reachedCore).padStart(4)}`,
    // Three different facts, and a run can be any one without the next: the sickness reaching the
    // core, the case being played, and the case being survived. A run that wins one last stand and
    // loses the second counts as fought and not as won, which is the reading that matters — the
    // last stand a run is remembered by is the one it ended on.
    `stand fought ${share(outcomes, (o) => o.lastStands > 0).padStart(4)}`,
    `stand won ${share(outcomes, (o) => o.lastStands > 0 && !o.lostAtCore).padStart(4)}`,
    `lost there ${share(outcomes, (o) => o.lostAtCore).padStart(4)}`,
    `idle ${show(median(of(outcomes, (o) => o.idleDays)), 4)}d`,
  ].join('  |  ');
}

/**
 * Every vaccine gate, as data rather than as a hope — and two columns rather than one, because
 * "reached" is the weaker half of the question.
 *
 * Chickenpox's 8 was chosen by an implementer and flagged as provisional, and it is the one gate a
 * run can fail to reach: `cleared` counts distinct case regions, retaking ground re-credits immunity
 * but never grows the list, and the ceiling is therefore the ten regions the body has. A gate a run
 * never reaches is a row that reads LOCKED for the whole game — the same broken promise `vaccines.ts`
 * already refuses for a gate above `CASES.length`, one step subtler.
 *
 * **`left` is the column that answers it.** A gate reached on the second-to-last day of a run the
 * player was already winning is reached and still worthless, and a share alone cannot tell those
 * apart. This is the median days of run remaining after the gate landed, over the runs that reached
 * it — what the vaccine actually got to do.
 */
function gateReport(groups: readonly RunGroup[]): string {
  const gated = VACCINES.filter((vaccine) => vaccine.gate !== undefined);

  const rows = gated.flatMap((vaccine) => {
    const gate = vaccine.gate ?? 0;
    return groups.map((group) => {
      const reachedOn = group.outcomes
        .map((o) => ({ day: o.clearDays[gate - 1], outcome: o }))
        .filter((entry): entry is { day: number; outcome: RunOutcome } => entry.day !== undefined);
      const left = reachedOn.map(({ day, outcome }) => outcome.days - day);
      return [
        `  ${vaccine.name.padEnd(24)} gate ${String(gate).padStart(2)}`,
        `${group.casePolicy.padEnd(14)} ${group.fightPolicy.padEnd(10)}`,
        `reached ${share(group.outcomes, (o) => o.cleared >= gate).padStart(4)}`,
        `on day ${show(median(reachedOn.map((entry) => entry.day)), 4)}`,
        `left ${show(median(left), 4)}d`,
      ].join('  ');
    });
  });

  const spreads = groups.map((group) => {
    const histogram = Array.from({ length: CASE_REGIONS.length + 1 }, (_unused, clears) =>
      group.outcomes.filter((o) => o.cleared === clears).length);
    const spread = histogram
      .map((count, clears) => (count === 0 ? null : `${String(clears)}:${String(count)}`))
      .filter((entry) => entry !== null)
      .join(' ');
    return `  ${group.casePolicy.padEnd(14)} ${group.fightPolicy.padEnd(10)} clears [${spread}]`;
  });

  return [
    'VACCINE GATES — how often a run reaches one, when, and how much run was left to spend it in',
    ...rows,
    'DISTINCT CLEARS — where each policy finishes, against the ten regions that is the ceiling',
    ...spreads,
    '  READ THIS BEFORE USING THE SHAPE: the bimodality — nearly nothing between 3 and 7 clears —',
    '  is partly the fight policy and not only the content. `learning` never improves at a case it',
    '  has not cleared and never loses one it has, so a run either fails to land a first clear or',
    '  goes on to clear almost everything. A model with a real learning curve would fill the middle.',
    '  (a report, not a gate; what a vaccine should cost is an author\'s judgement)',
  ].join('\n');
}

/**
 * Which arrivals get enumerated, and why it is not the first `HEART_CONTEXTS` of them.
 *
 * **It was `slice(0, 4)`, and that produced a false conclusion that got written into three files.**
 * `Map` insertion order here is group order, so the first four distinct keys all came from one
 * policy and all happened to carry two or fewer points of immunity. All four cleared 415/7776, and
 * "5.3% is stable across the arrivals runs actually make" was recorded in `cases.ts`, `band.ts` and
 * the task report on the strength of it. At a different seed count the head of the list contains an
 * arrival at three points of virus immunity, which clears **11.4%** — more than double. The claim
 * was false and the head-of-list sample is the only reason it looked true.
 *
 * So the selection is deliberately the extremes: least and most immunity, fewest and most cases
 * cleared. Four contexts is a quarter of an hour of enumeration and that budget is better spent on
 * the ends of the range than on four neighbours, because what the report has to support is a
 * **range** rather than a point.
 */
function spreadOf(arrivals: readonly CoreArrival[]): readonly CoreArrival[] {
  const total = (arrival: CoreArrival): number =>
    arrival.immunity.staph + arrival.immunity.film + arrival.immunity.virus;

  const byImmunity = [...arrivals].sort((a, b) => total(a) - total(b) || a.day - b.day);
  const byCleared = [...arrivals].sort((a, b) => a.cleared - b.cleared || a.day - b.day);

  const picked: CoreArrival[] = [];
  const wanted = [
    byImmunity[0], byImmunity[byImmunity.length - 1],
    byCleared[0], byCleared[byCleared.length - 1],
  ];
  for (const arrival of wanted) {
    if (arrival === undefined) continue;
    if (picked.includes(arrival)) continue;
    picked.push(arrival);
  }
  // Backfilled in insertion order only once the four ends are in, so a season whose arrivals are all
  // alike still spends the whole budget rather than reporting one context four times over.
  for (const arrival of arrivals) {
    if (picked.length >= HEART_CONTEXTS) break;
    if (!picked.includes(arrival)) picked.push(arrival);
  }
  return picked.slice(0, HEART_CONTEXTS);
}

/**
 * The last stand, entered the way runs actually arrive at it rather than at full everything.
 *
 * This is the measurement `band.ts` defers to by name. It plays the heart's whole board space at
 * each distinct arrival context the sweep saw, so the number it prints is the rate a real run meets
 * — a run arrives having *lost* ground, so it arrives with fewer clears and less immunity than the
 * board sweep's entry gives it, and the two numbers are allowed to differ by a lot.
 */
function heartReport(groups: readonly RunGroup[]): string {
  const arrivals = new Map<string, CoreArrival>();
  for (const group of groups) {
    for (const outcome of group.outcomes) {
      if (outcome.coreArrival === null) continue;
      const arrival = outcome.coreArrival;
      const key = [
        String(unlockedKinds(arrival.day - 1).length),
        String(arrival.cleared),
        `${String(arrival.immunity.staph)}${String(arrival.immunity.film)}${String(arrival.immunity.virus)}`,
        arrival.blocksAmnesia ? 'mmr' : 'raw',
      ].join('|');
      if (!arrivals.has(key)) arrivals.set(key, arrival);
    }
  }

  // What a typical arrival is, per policy, beside the handful that get enumerated. The enumeration
  // is capped at four contexts and costs a quarter of an hour, so without this the report would
  // describe the last stand by four arrivals nobody could tell were representative or not.
  const typical = groups
    .map((group) => {
      const seen = group.outcomes
        .map((outcome) => outcome.coreArrival)
        .filter((arrival): arrival is CoreArrival => arrival !== null);
      if (seen.length === 0) return `  ${group.casePolicy.padEnd(14)} ${group.fightPolicy.padEnd(10)} never reached the core`;
      return [
        `  ${group.casePolicy.padEnd(14)} ${group.fightPolicy.padEnd(10)}`,
        `${String(seen.length).padStart(3)} arrivals`,
        `median day ${show(median(seen.map((arrival) => arrival.day)), 4)}`,
        `median cleared ${show(median(seen.map((arrival) => arrival.cleared)), 3)}`,
      ].join('  ');
    });

  const spots = CASE_BY_ID.heart.spots.length;
  const rows = spreadOf([...arrivals.values()]).map((arrival) => {
    const kinds = unlockedKinds(arrival.day - 1);
    let boards = 0;
    let clears = 0;
    for (const board of everyBoard(kinds, spots)) {
      boards += 1;
      const outcome = playBoardIn({
        caseId: 'heart',
        immunity: arrival.immunity,
        clearedCount: arrival.cleared,
        day: arrival.day,
        blocksAmnesia: arrival.blocksAmnesia,
      }, board, 'never', EVERY_GROWABLE);
      if (outcome.cleared) clears += 1;
    }
    return `  day ${String(arrival.day).padStart(3)}  ${String(arrival.cleared).padStart(2)} cleared  immunity ${String(arrival.immunity.staph)}/${String(arrival.immunity.film)}/${String(arrival.immunity.virus)}  ${String(clears)}/${String(boards)} clear (${((clears / boards) * 100).toFixed(1)}%)`;
  });

  return [
    'LAST STAND — what runs arrive at the core with',
    ...typical,
    `  the heart's whole board space at ${String(Math.min(arrivals.size, HEART_CONTEXTS))} of those ${String(arrivals.size)} distinct arrivals — chosen as the extremes of immunity and clears, not the head of the list:`,
    ...(rows.length === 0 ? ['  no run reached the core'] : rows),
    '  (a report, not a gate; this is the range the last stand was tuned against, not the board sweep\'s single number)',
  ].join('\n');
}

function header(): string {
  return [
    'RUN SWEEP — whole runs on the real front line',
    `  seeds ${String(SEEDS)}  |  day ceiling ${String(MAX_RUN_DAYS)}`,
    `  OUTBREAK_INTERVAL ${String(OUTBREAK_INTERVAL)}  |  SIEGE_BASE_DAYS ${String(SIEGE_BASE_DAYS)}  |  DOOR_RESIST_PER_CLEAR ${String(DOOR_RESIST_PER_CLEAR)}`,
  ].join('\n');
}

describe('whole-run sweep', () => {
  let groups: readonly RunGroup[] = [];

  beforeAll(() => {
    console.log(header());
    groups = CASE_POLICIES.flatMap((casePolicy) =>
      FIGHT_POLICIES.map((fightPolicy) => ({
        casePolicy,
        fightPolicy,
        outcomes: Array.from({ length: SEEDS }, (_unused, index) =>
          playRun(index + 1, casePolicy, fightPolicy)),
      })));
    for (const group of groups) console.log(groupReport(group));
    console.log(gateReport(groups));
    console.log(heartReport(groups));
  });

  /**
   * The gates run per case policy, on `TUNING_POLICY` alone, and both halves of that matter.
   *
   * **Pooled across all six pairs they could not fail for the right reason.** `'stumbling'` loses
   * 99 to 100 per cent of runs at every setting of every constant and `'learning'` wins about half,
   * so "losable" was satisfied by a policy this file explicitly rules out for tuning and "winnable"
   * by another. A season that had become unlosable *for a person* would have sailed through on the
   * random-board player's losses. The two gates are the right two gates; they have to be asked of
   * the player the numbers were chosen against.
   *
   * Per case policy rather than pooled across the two, for the same reason: a season winnable only
   * by working down the list, or only by defending the core, is a season with one policy in it.
   */
  const tuning = (): readonly RunGroup[] =>
    groups.filter((group) => group.fightPolicy === TUNING_POLICY);

  it('leaves a run winnable — a season nobody can finish is not a season', () => {
    for (const group of tuning()) {
      expect(
        group.outcomes.filter((outcome) => outcome.result === 'won').length,
        `no seed ever held the body under ${group.casePolicy} / ${group.fightPolicy}`,
      ).toBeGreaterThan(0);
    }
  });

  it('leaves a run losable — a season nobody can lose is not a race', () => {
    for (const group of tuning()) {
      expect(
        group.outcomes.filter((outcome) => outcome.result === 'lost').length,
        `no seed ever lost the core under ${group.casePolicy} / ${group.fightPolicy}`,
      ).toBeGreaterThan(0);
    }
  });
});
