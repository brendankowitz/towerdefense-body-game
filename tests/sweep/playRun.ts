import { CASE_BY_ID } from '../../src/game/content/cases';
import { CASE_REGIONS } from '../../src/game/content/body';
import {
  createFront, endDay, hotCases, isLastStand, isRunLost, isRunWon, nodeOf,
} from '../../src/game/front';
import { stepsToCore } from '../../src/game/graph';
import {
  blocksAmnesia, clearCase, createFreshProfile, frontRules, recordCoreLoss, type Profile,
} from '../../src/game/progression';
import { createRng, type Rng } from '../../src/game/rng';
import type { CaseId, DefenderKind, StrainId } from '../../src/game/types';
import { boardAt, EVERY_GROWABLE, playBoardIn, unlockedKinds, type BoardContext } from './playBoard';

/**
 * Plays one whole run from a seed, on the real front line and the real simulation, and says what
 * happened. `playBoard.ts` is to a case what this is to a season: nothing here models the game —
 * `endDay` is the shipped day, `clearCase` and `recordCoreLoss` are the shipped writes, and every
 * fight is a real board played through the real step loop. What this file contributes is what the
 * player would decide, which is three things and no more.
 *
 * ---
 *
 * **The three judgement calls, and the direction each is wrong in.**
 *
 * **1. Which fire to fight.** `CasePolicy`, below. Two of them, because a pacing number that only
 * holds under one policy is a number about that policy.
 *
 * **2. What board the player brings.** The one that turned out to decide everything, and the reason
 * it is an axis rather than a decision. A run cannot enumerate a board space per day — that is the
 * board sweep, and it is minutes for one case — so the harness has to say how good the player is at
 * the fight, and the two honest answers sit at opposite ends:
 *
 * - `'learned'` — somebody who has met this case knows a board that beats it, so the harness
 *   searches the case's board space at this run's own day, immunity and vaccines and brings the
 *   first board that clears. This player wins every fight that is winnable at all.
 * - `'stumbling'` — somebody meeting every case cold, bringing a board drawn from the run's own
 *   rng. The board sweep says 5 to 15 per cent of boards clear, so this player loses about nine
 *   fights in ten and gives the sickness the day back every time.
 * - `'learning'` — drawn on a case this run has never cleared, learned on one it has. The two above
 *   are the ends of the bracket; this is the only one of the three that is a person.
 *
 * **The first trace this harness ever printed is why there are three and not one.** Under
 * `'learned'` the player cleared the one fire on the day it appeared, `infected` went empty, and
 * the sickness — which steps from ground it holds, and held none — never moved again. Four hundred
 * days, seven regions held, the other three never so much as alight, at every value of
 * `OUTBREAK_INTERVAL` from 2 to 6. That is not a tuning finding, it is arithmetic: an outbreak
 * seeds at most one door a day and the player clears at most one a day, so a player who wins every
 * fight empties the board every evening and the sickness is never standing anywhere to step from.
 * The front line exists **only on the player's losses**, and the three interior regions — both
 * lungs and the gut — have no door, so they can catch fire by spread alone and a player who never
 * falls behind can never be offered them at all.
 *
 * So a pacing constant measured against `'learned'` is a constant about a game that is not
 * happening, and one measured against `'stumbling'` is about a run that is over inside a fortnight.
 * `'learning'` is where the three constants have anything to move. `runSweep.ts` reports all three
 * and `rules.ts` records each number as what it was worth across them.
 *
 * **Which direction `'learning'` is wrong in, and the answer is "both, at different points in the
 * run".** `playBoard.ts` can say its purchasing policy is a *floor* — a player who declines every
 * option it declines plays exactly it, so best play is at least that good. Nothing of the kind is
 * true here, and saying so is the difference between a bracket and a bound:
 *
 * - **Before a case's first clear it is pessimistic.** The board is drawn uniformly, fresh, every
 *   single day, forever. Lose the forearm on day 3 and the harness draws again on day 4, day 5,
 *   day 40 — never getting better at a case it has now seen thirty-seven times. Real players
 *   improve at the fight they keep losing, and this models none of it.
 * - **After a case's first clear it is optimistic.** The case is thereafter won with certainty.
 *   Real players do not win a board because they once won it.
 *
 * So `'learning'` is a step function, not a learning curve, and it is **not a bound in either
 * direction** — it is the middle of a bracket whose two ends are the other policies. Every number
 * chosen against it is a number about that midpoint. The place this bites hardest is the shape of
 * the distinct-clear distribution, which comes out bimodal partly because the policy is
 * discontinuous; `runSweep.ts` says so where it prints it.
 *
 * What both share: the difficulty of an individual case is not what either models — the board sweep
 * is still the instrument for that. The one place that bites is the last stand, and `runSweep.ts`
 * answers it by measuring that case's clear rate at the contexts runs actually arrive at rather
 * than by inferring it from whether a run survived.
 *
 * **3. Nothing is ever reinforced.** `shoreUpRegion` is a real decision and a real use for the
 * bank, and this harness never takes it: every day is spent on a fight. Same shape as the board
 * sweep declining to reabsorb or call fever — a player who never reinforces plays exactly this
 * policy, so days survived here is a floor on what the same player could reach by spending the
 * bank. Unlike the two above, this one is wrong in the pessimistic direction.
 *
 * ---
 *
 * **The one place the harness overrides the policy: the last stand.** Once the sickness is on the
 * core, the heart is offered like any other fire and neither policy would necessarily take it —
 * `cheapest` would work down the season order for the rest of time. It cannot be left: a heart in
 * `infected` never leaves except by winning the case, and `isRunWon` refuses while it is there, so
 * a run that declines the last stand is a run that has stopped being able to end. Both policies
 * therefore answer it the day it is offered, which is also what the fiction says the day is.
 */

/**
 * How the player picks among the fires burning today.
 *
 * - `nearestToCore` — fight the one closest to the heart. The defensive read of the map, and the
 *   one the front line is designed to teach: keep a road open.
 * - `cheapest` — the earliest region in season order, which is a **list order and not a difficulty
 *   read**, and the name is kept only because it is what the brief called for. It was justified
 *   here as "easiest, because the season is a difficulty curve"; `curve.ts` disclaims exactly that
 *   property — it removed an adjacent-pair staircase for being "a stronger claim than the design
 *   makes and a wrong one", and gates only a pushover check and a halves trend. The measured season
 *   is not monotone (sinus 8.9% sits between measles 5.9% and bronchitis 5.2%), so with sinus and
 *   hand both alight this policy takes hand, the harder of the two. What it is a good model of is
 *   the player who works down the map in the order the game listed it, which is a real second
 *   reading and the reason it stays.
 */
export type CasePolicy = 'nearestToCore' | 'cheapest';

export const CASE_POLICIES: readonly CasePolicy[] = ['nearestToCore', 'cheapest'];

/** How good the player is at the fight itself. See the three described above. */
export type FightPolicy = 'learned' | 'learning' | 'stumbling';

export const FIGHT_POLICIES: readonly FightPolicy[] = ['learned', 'learning', 'stumbling'];

/**
 * A run that has not ended by here is not going to end on its own, and the shapes that do this are
 * real: a player who wins the last stand drives the sickness off the roads, it takes them back over
 * the following week, and the same fight comes round again for as long as the ten regions are never
 * all held at once. Failing loudly is the point — `stalled` is asserted against in
 * `playRun.test.ts`, so a tuning that makes a run unendable turns a test red rather than hanging a
 * sweep.
 */
export const MAX_RUN_DAYS = 400;

/**
 * How many boards the player is credited with having found their way through before a case counts
 * as one they cannot win.
 *
 * Sampled across the whole space rather than walked from the start of it: at a stride coprime to
 * every board count the season produces (243, 1024, 3125, 7776), successive samples land nowhere
 * near each other, so 400 of them is a spread reading of the space and not a deep look at boards
 * that all share three spots. Walking the odometer instead would hold spots 3 and 4 at the cheapest
 * cell for the first two hundred boards, which on a case whose reach lives in those spots is not a
 * search at all.
 *
 * 400 against the band's 5 per cent floor is a one-in-a-million chance of missing a case that has
 * winning boards. Measured in practice the first clear arrives in the first few dozen samples for
 * every case in the season, so the budget is what makes a *negative* trustworthy rather than
 * something the ordinary path spends.
 */
const SEARCH_BUDGET = 400;
const SEARCH_STRIDE = 2833;

/**
 * The board this run brings to this case, or null if the case is one it cannot win.
 *
 * Memoised, and the memo is the whole reason a sweep of hundreds of runs finishes: `playBoardIn` is
 * a pure function of the context and the board, so a case met on the same day, at the same
 * immunity, with the same vaccines and the same clears behind it plays out to the identical board
 * whichever run and whichever day it is met on. The search itself is real — every board in it is
 * played through the shipped step loop — and what the memo saves is replaying a board whose result
 * is already known.
 *
 * The key names every input to `createSimState` this could possibly turn on, `clearedCount`
 * included even though nothing in the simulation reads it today. A cache key that leaves out a
 * field because the code behind it happens to ignore it is a cache that starts lying the day
 * somebody uses that field.
 */
const LEARNED = new Map<string, readonly DefenderKind[] | null>();

/**
 * Empties the memo, for the test that one context cannot change what another measures.
 *
 * Contamination is only visible against a call made with **nothing in the memo**, so the test needs
 * to be able to empty it — but that alone is not enough, and two versions of that test were vacuous
 * before this one. What makes it able to fail is asserting on the *board* `learnedBoard` returns
 * rather than on a run's outcome: `playRun` only reads `!== null`, and whether a case is winnable at
 * all barely moves across the fields the key carries. `playRun.test.ts` records which field is
 * observable, which two are not, and the mutation that proves the difference.
 */
export function resetLearned(): void {
  LEARNED.clear();
}

function contextKey(context: BoardContext, kinds: readonly DefenderKind[]): string {
  const immunity = (['staph', 'film', 'virus'] as const)
    .map((strain: StrainId) => String(context.immunity[strain]))
    .join('');
  return [
    context.caseId,
    kinds.join(','),
    immunity,
    String(context.clearedCount),
    context.blocksAmnesia ? 'mmr' : 'raw',
  ].join('|');
}

export function learnedBoard(context: BoardContext): readonly DefenderKind[] | null {
  const kinds = unlockedKinds(context.day - 1);
  const key = contextKey(context, kinds);
  const cached = LEARNED.get(key);
  if (cached !== undefined) return cached;

  const spots = CASE_BY_ID[context.caseId].spots.length;
  const total = kinds.length ** spots;
  const budget = Math.min(SEARCH_BUDGET, total);

  let found: readonly DefenderKind[] | null = null;
  for (let sample = 0; sample < budget; sample += 1) {
    const board = boardAt(kinds, spots, (sample * SEARCH_STRIDE) % total);
    if (playBoardIn(context, board, 'never', EVERY_GROWABLE).cleared) {
      found = board;
      break;
    }
  }

  LEARNED.set(key, found);
  return found;
}

/** How a run arrived at the last stand: everything the heart case is played under when it lands. */
export interface CoreArrival {
  readonly day: number;
  readonly cleared: number;
  readonly immunity: Readonly<Record<StrainId, number>>;
  readonly blocksAmnesia: boolean;
}

export interface RunOutcome {
  /** `unfinished` only ever accompanies `stalled` — it is the day ceiling, not an ending. */
  readonly result: 'won' | 'lost' | 'unfinished';
  /** The day the run ended on, which is the day the map's own header was showing. */
  readonly days: number;
  /** Distinct case regions cleared over the whole run. Never falls; retaken ground re-clears. */
  readonly cleared: number;
  /**
   * The day each distinct clear landed on, in the order they landed. Null-free and never shrinks,
   * so `clearDays[n - 1]` is the day the run reached `n` distinct clears and `undefined` means it
   * never did.
   *
   * Here because a vaccine gate is a number of clears and the only question worth asking about one
   * is whether a run reaches it **while there is still a run left to spend it in**. A share of runs
   * that eventually reach eight says nothing about that; the day they reach it, against the day
   * they end, says all of it.
   */
  readonly clearDays: readonly number[];
  /** Case regions still held when it ended. Falls when a wall comes down. */
  readonly held: number;
  readonly fights: number;
  readonly lostFights: number;
  /** Days with no fire to fight, which is the outbreak interval showing through as idle time. */
  readonly idleDays: number;
  /** The sickness stood on the core at least once — the last stand happened. */
  readonly reachedCore: boolean;
  /** How many times it happened. More than one means a won last stand and a second siege. */
  readonly lastStands: number;
  readonly lostAtCore: boolean;
  readonly coreArrival: CoreArrival | null;
  readonly stalled: boolean;
}

function chooseCase(profile: Profile, policy: CasePolicy): CaseId | null {
  const hot = hotCases(profile.front);
  if (hot.length === 0) return null;
  const lastStand = hot.find((caseId) => isLastStand(caseId));
  if (lastStand !== undefined) return lastStand;

  if (policy === 'nearestToCore') {
    // Ties break on season order, which is what `hotCases` already hands back — several regions
    // sit the same number of steps out and the run has to pick one the same way every time.
    return hot.reduce((best, caseId) =>
      stepsToCore(nodeOf(caseId)) < stepsToCore(nodeOf(best)) ? caseId : best);
  }
  return hot[0] ?? null;
}

function heldRegions(profile: Profile): number {
  return CASE_REGIONS.filter((node) => profile.front.held.includes(node.id)).length;
}

function contextFor(profile: Profile, caseId: CaseId): BoardContext {
  return {
    caseId,
    immunity: profile.immunity,
    clearedCount: profile.cleared.length,
    day: profile.front.day,
    blocksAmnesia: blocksAmnesia(profile),
  };
}

/**
 * The player's stream, derived from the run's seed rather than *being* it.
 *
 * **This is a correction, and the bug it fixes was invisible to every determinism test.** The hand
 * used to be `createRng(seed)`, the same call `createFront(seed)` makes. mulberry32 advances its
 * counter by a fixed constant, so two generators started on the same seed are the *same sequence*:
 * the first variate that chose the run's opening door was the identical variate that chose the
 * run's first board. Measured before the fix, on seed 7, `0.01170` picked door 0 and board 91 of
 * 7776; on seed 42, `0.60110` picked door 4 and board 4674. Across every seed in every sweep the
 * opening door and the first board were perfectly rank-correlated.
 *
 * Replay was never affected — a seed still reproduced itself exactly — which is why nothing caught
 * it. What was affected is the **sample**, in the one fight policy all four pacing constants were
 * chosen against. Every number in `rules.ts` was re-measured after this landed.
 *
 * A multiply-xor rather than an offset: two mulberry32 streams whose counters differ by a constant
 * re-collide the moment their draw counts differ by the right amount, and an offset makes that
 * amount small and reachable. Hashing the seed puts the two starts far enough apart that no run
 * this harness plays gets near it.
 */
function handSeed(seed: number): number {
  return (Math.imul(seed ^ 0x9e3779b1, 0x85ebca6b) ^ 0x27d4eb2f) >>> 0;
}

/**
 * The board a player who has learned nothing brings: one drawn from the space, fresh every fight.
 *
 * The draw runs off a generator of its own rather than off `front.rngState`, because the front's
 * rng is the sickness's and threading the player's coin flips through it would change which door
 * every outbreak lands at. The sickness therefore plays out identically whichever fight policy is
 * measured against it, which is what makes the three comparable at all — and, since `handSeed`
 * above, the player's draws are also independent of the sickness's rather than a relabelling of
 * them.
 */
function drawnBoard(rng: Rng, context: BoardContext): readonly DefenderKind[] {
  const kinds = unlockedKinds(context.day - 1);
  const spots = CASE_BY_ID[context.caseId].spots.length;
  const total = kinds.length ** spots;
  return boardAt(kinds, spots, Math.floor(rng.next() * total));
}

/**
 * `'learning'` and not `'learned'`, which is what this defaulted to: a default that resolves no run
 * at all is the wrong one to hand a caller who did not state a preference, and it put the one policy
 * the file says measures nothing into the tests that omitted the argument.
 */
export function playRun(
  seed: number,
  policy: CasePolicy,
  fightPolicy: FightPolicy = 'learning',
): RunOutcome {
  // The fresh profile, on the door this seed opens on. Everything else about a new body — the
  // bank, the empty immunity, the empty cleared list — is the shipped one rather than a fixture,
  // so a run measured here starts where a player's does.
  let profile: Profile = { ...createFreshProfile(), front: createFront(seed) };
  const hand = createRng(handSeed(seed));

  let fights = 0;
  let lostFights = 0;
  let idleDays = 0;
  let lastStands = 0;
  let reachedCore = false;
  let coreArrival: CoreArrival | null = null;
  const clearDays: number[] = [];

  const finish = (result: RunOutcome['result']): RunOutcome => ({
    result,
    days: profile.front.day,
    cleared: profile.cleared.length,
    clearDays,
    held: heldRegions(profile),
    fights,
    lostFights,
    idleDays,
    reachedCore,
    lastStands,
    lostAtCore: profile.front.lost,
    coreArrival,
    stalled: result === 'unfinished',
  });

  for (let lived = 0; lived < MAX_RUN_DAYS; lived += 1) {
    // Asked of the map rather than inferred from the fight below, because they are different
    // facts: the sickness standing on the core is what starts the last stand, and a run could in
    // principle end on the same morning it arrives there without the case ever being played.
    if (profile.front.infected.includes('heart')) reachedCore = true;
    if (isRunLost(profile.front)) return finish('lost');
    if (isRunWon(profile.front)) return finish('won');

    const caseId = chooseCase(profile, policy);
    if (caseId === null) {
      idleDays += 1;
    } else {
      const context = contextFor(profile, caseId);
      fights += 1;
      if (isLastStand(caseId)) {
        lastStands += 1;
        coreArrival ??= {
          day: context.day,
          cleared: context.clearedCount,
          immunity: context.immunity,
          blocksAmnesia: context.blocksAmnesia,
        };
      }

      // `cleared` never holds the heart — `clearCase` keeps the last stand out of it — so the one
      // case in the season a `'learning'` player always meets cold is the one whose own rule says
      // nothing has met it before.
      const knows = fightPolicy === 'learned'
        || (fightPolicy === 'learning' && profile.cleared.includes(caseId));
      const won = knows
        ? learnedBoard(context) !== null
        : playBoardIn(context, drawnBoard(hand, context), 'never', EVERY_GROWABLE).cleared;

      if (!won) {
        lostFights += 1;
        // Every other case simply stays hot and is offered again tomorrow. The last stand is the
        // one loss the run remembers, and the only one that ends it.
        if (isLastStand(caseId)) profile = recordCoreLoss(profile);
      } else {
        const before = profile.cleared.length;
        profile = clearCase(profile, caseId, profile.kills);
        // Retaking ground the run already holds re-credits its strain without growing the list, and
        // the last stand never enters it at all — so this only records a clear that moved a gate.
        if (profile.cleared.length > before) clearDays.push(profile.front.day);
      }
    }

    // The day is spent whichever of those happened, including the idle one — the same rule the
    // app enforces, and the reason a lost fight costs exactly what a won one does.
    profile = {
      ...profile,
      front: endDay(profile.front, profile.immunity, frontRules(profile)),
    };
  }

  return finish('unfinished');
}
