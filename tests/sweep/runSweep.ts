import { beforeAll, describe, expect, it } from 'vitest';
import { strainOf } from '../../src/game/arrivals';
import { CASE_REGIONS } from '../../src/game/content/body';
import { CASE_BY_ID, CASES } from '../../src/game/content/cases';
import {
  DOOR_RESIST_PER_CLEAR, IMMUNITY_MAX, OUTBREAK_INTERVAL, SIEGE_BASE_DAYS,
} from '../../src/game/content/rules';
import { VACCINES } from '../../src/game/content/vaccines';
import type { CaseId, StrainId } from '../../src/game/types';
import {
  everyBoard, EVERY_GROWABLE, NO_MEMORY, playBoardIn, unlockedKinds, type BoardContext,
} from './playBoard';
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
 * **All four have since been re-measured against the memory response, and none of them moved.** At
 * 200 seeds under `TUNING_POLICY`, nearestToCore / cheapest, with arrivals on and the season
 * re-measured against them — the pre-feature reading beside it:
 *
 *     won 48% / 46%  →  49% / 47%      lost  32% / 40%  →  33% / 39%
 *     unresolved 21% / 14%  →  19% / 14%    core reached 32% / 42%  →  33% / 41%
 *     median run 121 / 98 days  →  97 / 83 days   held 9 / 8 of 10  →  9 / 9 of 10
 *
 * Every share is inside the roughly three-and-a-half point standard error at 200 seeds. **The one
 * figure that moved is the median run, and it moved down**: arrivals win fights the player would
 * have lost, a won fight is ground kept rather than a day given back, and a run that stops giving
 * days back ends sooner. The season became shorter rather than easier or harder, which is why three
 * pacing constants chosen on loss share, on `unresolved` and on a structural argument are all
 * untouched by a feature that changed every board in the game. The heart is the same story from the
 * other side: its board space at a real arrival is unchanged, but no run now arrives at the core
 * holding everything, because the runs that used to were the very long ones. `cases.ts` has that.
 *
 * **What did move is a policy nobody tunes against.** `'stumbling'` used to lose every run at every
 * setting of every constant; it now wins 6 per cent of `nearestToCore` runs and 33 per cent of
 * `cheapest` ones. `'learning'` wins a case it has cleared once with certainty, so help that makes a
 * board likelier to clear is nearly invisible to it and worth a great deal to the player drawing
 * boards at random. The bracket these numbers sit in has narrowed from below.
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
 * never reaches is a row that reads LOCKED for the whole game — the same broken promise
 * `content.invariants.test.ts` now refuses for a gate above `CASE_REGIONS.length`, one step
 * subtler: that guard rules out a gate no run *can* satisfy, this column watches for one no run
 * *does*.
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
 * arrival at three points of one strain that clears more than twice that. The claim was false, and
 * the head-of-list sample is the only reason it looked true.
 *
 * So the selection is deliberately the extremes: least and most immunity, fewest and most cases
 * cleared. Four contexts is a quarter of an hour of enumeration and that budget is better spent on
 * the ends of the range than on four neighbours, because what the report has to support is a
 * **range** rather than a point. Selecting that way measured the real top at **13.6%** against the
 * 5.3% floor — higher than the head-of-list sample had found, which is the argument for picking the
 * ends rather than for picking more of them.
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
 * One case's whole board space at one context, which is what both blocks below are made of.
 *
 * A quarter of an hour used to be the figure written down for four of these; measured at HEAD one
 * costs about 95 seconds, and the run sweep's config carries the clock that covers however many
 * this file asks for. Shared rather than written twice because the last stand and a re-fight are
 * the same measurement asked at two different contexts, and two copies of it would be two places
 * for a `'never'` or an `EVERY_GROWABLE` to drift.
 */
function enumerate(context: BoardContext): { readonly clears: number; readonly boards: number } {
  const kinds = unlockedKinds(context.day - 1);
  let boards = 0;
  let clears = 0;
  for (const board of everyBoard(kinds, CASE_BY_ID[context.caseId].spots.length)) {
    boards += 1;
    if (playBoardIn(context, board, 'never', EVERY_GROWABLE).cleared) clears += 1;
  }
  return { clears, boards };
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

  const rows = spreadOf([...arrivals.values()]).map((arrival) => {
    const { clears, boards } = enumerate({
      caseId: 'heart',
      immunity: arrival.immunity,
      day: arrival.day,
      blocksAmnesia: arrival.blocksAmnesia,
      // The memory the run turned up with, which is the whole point of enumerating at a real
      // arrival rather than at full everything. See `ArrivalPolicy`.
      arrivals: 'earned',
    });
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

/**
 * How many cases get their worst real fight enumerated, and why the selection is a ranking rather
 * than a list somebody typed.
 *
 * Each context costs two enumerations — the memory the run earned and none at all — so five cases
 * is ten of them, measured at 818 seconds on top of the 959 the runs take. They are the five held
 * at the cap most often under `TUNING_POLICY`, because how often a run is *in* a context is the
 * only thing that makes enumerating it worth a quarter of an hour.
 *
 * **That ranking is a rule and it excludes things.** At 200 seeds it spends the budget on vesper,
 * bronchitis, forearm, relapse and blister, and the sixth is the sinus at 11.6% — which is the one
 * case in the season where a re-fight at the cap clears *fewer* boards than no memory at all (684
 * against 693, measured on a narrowed run that happened to reach it), because that case charges the
 * player per kill and free kills are a bill. A case fought at the cap rarely can still be the case
 * this feature does the most to, and the ranking will not show it. The per-case table is not capped
 * and always carries all eleven.
 */
const REFIGHT_CONTEXTS = 5;

/**
 * The strains a case's own wave table sends, of the three an immunity record tracks.
 *
 * Asked of `strainOf` rather than of a list of three names written here, for the reason that
 * function gives: `PathogenKind` and `StrainId` overlap on exactly three members and one place
 * should say which. A case is "held at the cap" only over the strains it actually sends — the
 * throat holding staph at three is worth nothing to the throat, whose table has no staph in it.
 */
function strainsSentBy(caseId: CaseId): readonly StrainId[] {
  const sent = new Set<StrainId>();
  for (const wave of CASE_BY_ID[caseId].waves) {
    for (const body of wave) {
      const strain = strainOf(NO_MEMORY, body.kind);
      if (strain !== undefined) sent.add(strain);
    }
  }
  return [...sent];
}

function depthOver(context: BoardContext, sent: readonly StrainId[]): number {
  return sent.reduce((total, strain) => total + context.immunity[strain], 0);
}

/**
 * The worst fight a run actually plays at this case: the most memory it is ever met with over the
 * strains its own table sends, and among those the earliest day — so the dock is as small as that
 * memory ever comes with.
 *
 * **The tie-break is the load-bearing half.** A re-fight brings two things the board sweep's
 * season-order entry does not, the memory *and* a bigger dock, and a rule that took the latest such
 * day would charge the memory for both. Taking the earliest is the direction that is least
 * favourable to calling this a memory problem, which is the direction a selection rule should lean
 * when the conclusion it feeds is "this is not one".
 */
function worstFight(
  fought: readonly BoardContext[],
  sent: readonly StrainId[],
): BoardContext | null {
  let worst: BoardContext | null = null;
  for (const context of fought) {
    if (worst === null) { worst = context; continue; }
    const depth = depthOver(context, sent);
    const best = depthOver(worst, sent);
    if (depth > best || (depth === best && context.day < worst.day)) worst = context;
  }
  return worst;
}

/**
 * **What a run brings when it takes ground back, and why this is a report and not a second band.**
 *
 * The season-order walk `balance.sweep.ts` measures is the *first* time a run meets a case. It is
 * not most of the times it meets one: ground falls and is retaken, and the case is met again with
 * every clear since behind it. This says how often that happens at the deepest memory the case can
 * be met with, and what the board space clears there.
 *
 * **Read only the tuning policy's fights.** Pooling the three is not a cosmetic error — `stumbling`
 * loses about nine fights in ten and therefore re-fights everything forever, so a pooled count is
 * mostly a statement about that player. Measured both ways on the same sample, the pool moved the
 * numbers this block's argument rests on in *both* directions.
 *
 * ---
 *
 * **Two enumerations per context, and the second is why the first means anything.** A run that
 * comes back to the forearm on day 12 brings the memory and three more cells in the dock, and one
 * number off that fight charges the memory for both. `no memory` is the same case, the same day,
 * the same dock, with every strain zeroed — so the pair is two unconditional readings rather than a
 * difference, and the gap between them is the memory alone. What that gap does *not* separate is
 * the vaccine from the response: the three strain vaccines fire at `IMMUNITY_MAX`, so at the cap
 * both are live and only an operator edit to `ARRIVALS_ENABLED` can tell them apart. `ArrivalPolicy`
 * has the whole argument for why this harness cannot do that from inside one process.
 *
 * **This gates nothing, and the reason is the same one the two gates below are the only two.** A
 * band asserted on this arm would be red with the memory response turned off entirely. Enumerated
 * in a copy of the tree with `ARRIVALS_ENABLED` false, at the four contexts a previous round picked:
 *
 *     forearm day 12 at 3/3/0   no memory 2011/7776 = 25.9%   flag off 2686/7776 = 34.5%
 *     throat  day 24 at 1/3/3   no memory  899/7776 = 11.6%   flag off 3181/7776 = 40.9%
 *     stomach day 16 at 3/3/1   no memory  611/7776 =  7.9%   flag off 1229/7776 = 15.8%
 *     blister day 24 at 3/3/3   no memory  597/7776 =  7.7%   flag off  997/7776 = 12.8%
 *
 * **Three of the four are already over the 15% ceiling before this feature existed**, and the
 * forearm is over it at *zero* memory — 25.9%, on the dock schedule alone, eleven points out with
 * no vaccine and no response in the fight. The ways to make such a gate green are to slow the dock
 * or weaken the three vaccines. Neither is a memory decision, and a gate whose loudest failure can
 * only be answered by tuning something it was not asking about is exactly the number-picking this
 * harness exists to refuse.
 *
 * **The deeper reason is that one threshold cannot tell these contexts apart**, and this block's own
 * rows are the demonstration rather than the four above. The five worst real fights it enumerated at
 * 200 seeds, each beside its own no-memory control:
 *
 *     forearm    day 21 at 3/3/1   3568/7776 = 45.9%   no memory 2011/7776 = 25.9%
 *     blister    day 24 at 3/3/3   1865/7776 = 24.0%   no memory  597/7776 =  7.7%
 *     relapse    day 18 at 3/3/0    902/7776 = 11.6%   no memory  158/7776 =  2.0%
 *     bronchitis day 22 at 0/3/3    881/7776 = 11.3%   no memory  363/7776 =  4.7%
 *     vesper     day 28 at 3/3/3    547/7776 =  7.0%   no memory  106/7776 =  1.4%
 *
 * **Three of the five are inside the 5–15% band at the worst fight a run ever brings them**, which
 * is the reading a gate would have been built without. What separates the two that are not is not
 * the memory: the forearm brings 25.9 of its 45.9 points with no memory whatsoever, on a dock
 * authored for three cells and re-fought with six, and the blister brings none of its 24.0 that way.
 * One threshold across these five would be answering a dock-schedule question and a
 * memory-response question with one number.
 *
 * **And the no-memory column is a control rather than a target on the late cases.** Relapse at 2.0%
 * and vesper at 1.4% are far under the band floor, which says those cases are authored to be met by
 * a profile that remembers something — the season hands them deep memory by the day they are
 * reached, and the board sweep enters them at 2/3/3 and 3/3/3 for that reason. Reading those two
 * rows as "the case is unwinnable" would be reading a counterfactual as a season.
 *
 * **The blister, which is the one context that leaves the band on the response alone.** Its dock is
 * full by day 5, so a re-fight buys it no cells, and its season-order entry holds no strain at the
 * cap, so no vaccine is live there either — measured, 597/7776 at day 24 with zero memory and
 * 597/7776 at its own day-5 entry, the same boards twice. At 3/3/3 with `ARRIVALS_ENABLED` false it
 * clears 997/7776 = 12.8%, still inside the band; with it true, 1865/7776 = 24.0%. **Nothing was
 * done about that, and the measurement is the reason rather than the deferral.** The lever that fits
 * is the case's own wave table — staph and film almost throughout, met by a profile at the cap on
 * both, which is the most this feature can do to anything in the season — and not a dial in
 * `rules.ts`, since every dial there moves all eleven season-order rates, four of which sit within a
 * point of a band edge. What the run instrument says about the cost is the row that settles it: the
 * pacing figures above are measured *with* these re-fights in them, and they meet all three of the
 * targets `rules.ts` states. An easier re-taking of lost ground is not an unmeasured excursion here;
 * it is priced into the numbers the front line is tuned on, and it is most of what turned the
 * `stumbling` player from a run that never wins into one that sometimes does.
 *
 * **What nobody has written is a target.** Nothing in this repo says what share of boards re-taking
 * ground *should* clear. Until that sentence exists any threshold here is somebody's taste wearing
 * an assertion, and the order is: write the target, then measure against it.
 *
 * ---
 *
 * **Two things the rows do not say for themselves.**
 *
 * The enumeration is capped and the per-case table above it is not, which is the split that matters
 * if the cap ever hides something: every case's at-cap share and worst real fight is printed every
 * run, and only the board space behind them is rationed. The blister's row is there whether or not
 * the ranking spends a context on it, and the paragraph above is what a reader needs beside it.
 *
 * **"At the cap" is read off the profile, and the measles takes one of them away.** That case wipes
 * the strain it holds most of, so a profile at the cap on film meets its board with film at zero
 * unless MMR is held. The share printed for it is therefore an upper bound on how often it is
 * *fought* at the cap, which is the one case in the season where those two differ.
 */
function refightReport(groups: readonly RunGroup[]): string {
  const fought = groups
    .filter((group) => group.fightPolicy === TUNING_POLICY)
    .flatMap((group) => group.outcomes.flatMap((outcome) => outcome.fought));

  const measured = CASES.map((definition) => {
    const sent = strainsSentBy(definition.id);
    const own = fought.filter((context) => context.caseId === definition.id);
    const atCap = own.filter((context) => depthOver(context, sent) >= sent.length * IMMUNITY_MAX);
    return {
      caseId: definition.id,
      sent,
      fights: own.length,
      atCap: atCap.length,
      worst: worstFight(own, sent),
    };
  });

  const rows = measured.map((entry) => [
    `  ${entry.caseId.padEnd(11)}`,
    `sends ${entry.sent.join(',').padEnd(17)}`,
    `at cap ${String(entry.atCap).padStart(4)}/${String(entry.fights).padEnd(5)}`,
    (entry.fights === 0 ? '—' : `${((entry.atCap / entry.fights) * 100).toFixed(1)}%`).padStart(6),
    entry.worst === null
      ? 'never fought'
      : `worst real fight  day ${String(entry.worst.day).padStart(3)}  immunity ${String(entry.worst.immunity.staph)}/${String(entry.worst.immunity.film)}/${String(entry.worst.immunity.virus)}`,
  ].join('  '));

  const picked = measured
    .filter((entry): entry is typeof entry & { worst: BoardContext } =>
      entry.worst !== null && entry.atCap > 0)
    .sort((a, b) => b.atCap / b.fights - a.atCap / a.fights)
    .slice(0, REFIGHT_CONTEXTS);

  const enumerated = picked.map((entry) => {
    const worst = entry.worst;
    const earned = enumerate(worst);
    const cold = enumerate({ ...worst, arrivals: 'none' });
    const pct = (clears: number, boards: number): string =>
      `${((clears / boards) * 100).toFixed(1)}%`;
    return [
      `  ${entry.caseId.padEnd(11)}`,
      `day ${String(worst.day).padStart(3)}`,
      `${String(unlockedKinds(worst.day - 1).length)} cells`,
      `immunity ${String(worst.immunity.staph)}/${String(worst.immunity.film)}/${String(worst.immunity.virus)}`,
      `earned ${String(earned.clears).padStart(4)}/${String(earned.boards)} = ${pct(earned.clears, earned.boards).padStart(5)}`,
      `no memory ${String(cold.clears).padStart(4)}/${String(cold.boards)} = ${pct(cold.clears, cold.boards).padStart(5)}`,
    ].join('  ');
  });

  return [
    `RE-FIGHT — the same case met again, with everything the run learned since (${TUNING_POLICY} only)`,
    ...rows,
    `  the worst real fight of the ${String(picked.length)} cases held at the cap most often, each played twice — the memory the run earned, and none at all:`,
    ...(enumerated.length === 0 ? ['  no case was ever held at the cap on the strains it sends'] : enumerated),
    '  (a report, not a gate. `no memory` is the control that stops the memory being charged for the',
    '  dock; what it cannot separate is the vaccine from the response, which needs ARRIVALS_ENABLED',
    '  off in a copy of the tree. The docstring above has that measurement and what was decided on it.)',
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
    console.log(refightReport(groups));
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
