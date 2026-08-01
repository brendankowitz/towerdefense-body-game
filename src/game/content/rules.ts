/** Board coordinate space. Prototype line 910: viewBox "0 0 374 430". */
export const BOARD_WIDTH = 374;
export const BOARD_HEIGHT = 430;

export const STEP_SECONDS = 1 / 60;
export const FAST_MULTIPLIER = 2;

export const TISSUE_PIPS = 5;
export const IMMUNITY_MAX = 3;
export const TOWER_MAX_HP = 100;
export const BUILD_SPOT_RADIUS = 24;

export const WAVE_CLEAR_ENERGY = 50;
export const CASE_CLEAR_BANK = 180;

/**
 * The share of everything spent on a cell that comes back when the body reabsorbs it. Well
 * under one on purpose: a full refund makes placement free to undo, and a decision with no
 * cost to being wrong is not a decision.
 */
export const REABSORB_REFUND = 0.6;

export const FEVER_DURATION = 5;
export const FEVER_SLOW = 0.4;

export const SPAWN_FIRST_DELAY = 0.3;
export const SPAWN_BASE_INTERVAL = 0.72;
export const SPAWN_INTERVAL_PER_WAVE = 0.07;
export const SPAWN_MIN_INTERVAL = 0.4;

export const BLEED_INTERVAL = 1;
export const BLEED_AMOUNT = 2;

/** Hazard constants inlined in the prototype's step loop (lines 653–663), named here. */
export const TOXIN_STUN_RADIUS = 40;
export const POISON_RADIUS = 42;
export const POISON_DPS_ANTIBODY = 5;
export const POISON_DPS_OTHER = 10;

export const TAG_REWARD_MULTIPLIER = 1.5;
export const TAGGED_BURST_MULTIPLIER = 2;

/**
 * The dormancy rule. A share of what dies goes back down rather than away, and comes back once,
 * weaker, where it fell.
 *
 * `DORMANT_DELAY` is the only one of these that is a feel decision rather than a magnitude. It has
 * to outlast the fight over the body that just died — otherwise the revenant arrives into the same
 * guns that killed it and the rule is a health bar, not a relapse — and it has to be shorter than
 * the tail of a wave, or every wave ends with the player watching an empty vessel. A little over
 * the spawn interval, so a revenant lands among the bodies still arriving, is both.
 */
export const DORMANT_CHANCE = 0.35;
export const DORMANT_DELAY = 5;
export const DORMANT_HP_FRACTION = 0.5;

/**
 * The overreaction rule. Every kill inflames the tissue, and the inflammation is what costs the
 * player — so the dial is how many kills buy a pip.
 *
 * Counted in **bodies rather than in health**, which is the whole reason the rule reads as a rule
 * and not as a second health bar. Priced by mass, a cell that kills many small things would be
 * cheap and one that kills a few heavy things expensive, which is the ordinary economy inverted
 * and nothing more. Priced per body, area damage is the expensive answer and a single heavy hit is
 * the cheap one — so *which* cell the player picks is the decision, not merely how many.
 *
 * The threat's own half of the rule is not here: it is `PathogenStats.leak`, because "this does no
 * harm when it gets through" is a fact about pollen and not about the case it turns up in.
 */
export const INFLAMMATION_PER_PIP = 12;

export const SPLIT_COUNT = 2;
export const SPLIT_HP_FRACTION = 0.5;
export const SPLIT_BACK_OFFSET = 14;
export const SPLIT_BACK_SPACING = 12;
export const SPLIT_SPEED_FACTOR = 0.85;
export const SPLIT_RADIUS_FACTOR = 0.75;

/**
 * A fresh body. Used by both first run and "Start a new body" — the prototype's
 * day-4 opening (line 466) was demo staging and is not shipped. Prototype line 580.
 *
 * `seed` picks which door the front line opens on. One fixed seed rather than a random draw:
 * `src/game` may not touch `Math.random`, and a fresh body is meant to be the same fresh body
 * every time (decision D7) — the door it opens on is part of that.
 *
 * No `day` here: `front.day` (set by `createFront`) is the only day a profile has. A second
 * `day` on this constant would be exactly the orphaned duplicate this file used to carry.
 */
export const FRESH_PROFILE = { bank: 240, seed: 1 } as const;

/**
 * The front line, and every number it runs on. All three are pacing values and pacing is a property
 * of a whole run, so none of them may be chosen by feel — `tests/sweep/runSweep.ts` is the
 * instrument that measures them and the only thing that should move them.
 *
 * `OUTBREAK_INTERVAL` is days between new doors opening. `SIEGE_BASE_DAYS` is how long ground with
 * no immunity behind it holds, so a wall is `SIEGE_BASE_DAYS + response`. `DOOR_RESIST_PER_CLEAR`
 * is the chance one clear of a strain buys that an outbreak of it never takes hold.
 *
 * ---
 *
 * **All three were placeholders and all three have now been swept.** 40 seeds per cell, both case
 * policies, under the `'learning'` fight policy — the only one of the three that is a person, for
 * the reason `playRun.ts` writes out at length. `'stumbling'` was measured across the whole
 * `OUTBREAK_INTERVAL` spread and dropped from the two later sweeps: it loses 100 per cent of runs
 * by day 13 to 27 at *every* value of *every* constant, so it brackets the season without
 * discriminating between settings of it. `'learned'` resolves no runs at all and cannot be tuned
 * against.
 *
 * The three targets these were chosen against, stated before the numbers came in:
 *
 * 1. **Losable but not hopeless** — 25 to 60 per cent of runs lost, on both case policies.
 * 2. **Long enough that holding ground mattered** — a median run past 30 days. The season is ten
 *    fights, so past 30 means most days went on defending rather than on advancing.
 * 3. **The heart reached in a real share** — 25 to 65 per cent of runs.
 *
 * A fourth reading is not a target but is the thing to watch: **unresolved**, the share of runs
 * still going at the 400-day ceiling. A run that neither wins nor loses is a run that met none of
 * the three, and two of these three constants turned out to move it far harder than they move
 * anything else.
 *
 * **What the three chosen together produce**, confirmed at 200 seeds — five times the sample the
 * choices were made on — by `npm run sweep:runs`, `'learning'`, nearestToCore / cheapest:
 *
 *     won 50% / 45%   lost 27% / 41%   unresolved 23% / 14%
 *     median run 122 / 113 days   held 9.5 / 9 of 10   core reached 28% / 43%
 *
 * All three targets met on both policies. Re-run that sweep and re-read this block before moving
 * any of the three below; the numbers under each are what one step of it was worth, and they are
 * the only reason any of them is the value it is.
 */

/**
 * **Worth per step: about 20 points of loss share, and it is the strongest of the three by an order
 * of magnitude.** Swept over 2, 3, 4, 5, 6 (nearestToCore / cheapest, share of runs lost):
 *
 *     OI=2  48% / 57%     OI=4  28% / 38%     OI=6  13% / 18%
 *     OI=3  48% / 63%     OI=5  20% / 30%
 *
 * **4 is the only value that meets all three targets on both policies**, and the decisive number is
 * not the loss share — it is what the run looks like underneath it. At 3, the median `cheapest` run
 * ends **on day 21 holding 1 region**: a run that was over before there was a wall to defend, which
 * fails target 2 outright. At 4 the same median run is **123 days holding 9 of 10**. Going the other
 * way, every step above 4 buys its lower loss share by turning runs into non-endings rather than
 * into wins — unresolved runs go 15% at 4, 30% at 5, **43%** at 6, because a player who outruns the
 * seeding is never offered the three interior regions at all and can never hold all ten.
 *
 * The heart follows the same curve and lands in the target at the same place: reached in 30% of
 * `nearestToCore` runs and 43% of `cheapest` ones at 4, against 48/63% at 3 and 13/18% at 6.
 */
export const OUTBREAK_INTERVAL = 4;

/**
 * **Worth per step: about 2 points of loss share — a tenth of what one step of `OUTBREAK_INTERVAL`
 * is worth, and inside the noise of 40 seeds.** Swept over 0, 1, 2, 3 at `OUTBREAK_INTERVAL` 4
 * (nearestToCore / cheapest, share of runs lost):
 *
 *     SBD=0  28% / 33%     SBD=2  25% / 30%
 *     SBD=1  28% / 38%     SBD=3  23% / 38%
 *
 * **So the run does not care, and that is the measurement.** The reason it does not is structural:
 * two of the six roads to the core are joints, no case is fought over them, so no wall can ever
 * stand on them — the sickness takes a third of its approach for free whatever this number is.
 *
 * Measuring it flat is what licenses choosing it on what it makes true rather than on what it
 * moves, and there are two ends to rule out. **0 is not available**: it makes a region cleared
 * against a strain the run has never beaten fall the day the sickness arrives, so a first clear
 * buys no wall at all and `held` and `cold` become the same state. **2 and 3 cost the rule its
 * shape**: a wall is `SIEGE_BASE_DAYS + response`, so at 1 a fully earned wall holds four times
 * what a fresh one does and at 3 it holds twice — and the design's claim is that what a wall is
 * made of is immunity. 1 is the smallest base that leaves a first clear worth something, and the
 * one that leaves immunity the thing deciding how long ground holds.
 */
export const SIEGE_BASE_DAYS = 1;

/**
 * **Worth per step: nothing at all below 0.25, and then a cliff.** Swept over 0, 0.15, 0.25, 0.34,
 * 0.5 at `OUTBREAK_INTERVAL` 4 and `SIEGE_BASE_DAYS` 1 (nearestToCore / cheapest):
 *
 *     DR=0     lost 28% / 40%   unresolved 15% /  8%
 *     DR=0.15  lost 28% / 38%   unresolved 15% /  8%
 *     DR=0.25  lost 28% / 38%   unresolved 15% / 15%
 *     DR=0.34  lost 28% / 35%   unresolved 28% / 30%
 *     DR=0.5   lost 25% / 33%   unresolved 38% / 35%
 *
 * The loss share is flat across the whole spread. What moves is the share of runs that stop being
 * able to end, and it moves between 0.25 and 0.34 for an exact reason: `MAX_DOOR_RESISTANCE` is
 * `IMMUNITY_MAX * DOOR_RESIST_PER_CLEAR`, so at 1/3 and above a door whose strain the run has
 * beaten three times can **never** open again. Past that point a player who gets ahead seals the
 * body, the seeding stops, the three interior regions are never offered, and the run cannot reach
 * the ten-region win — which is why wins fall from 57% to 38% while losses do not move. The lever
 * is not difficulty; past a third it is an off switch.
 *
 * **0.25 is the largest value on the safe side of that cliff, and it is the choice.** It gives a
 * 0 / 25 / 50 / 75 per cent ladder a player can read off the immunity screen, and it leaves a
 * quarter chance at full immunity that the door opens anyway — so no door is ever closed, which is
 * the thing the run needs to stay endable.
 */
export const DOOR_RESIST_PER_CLEAR = 0.25;

/** Bank spent to add one day to a wall. The only thing that competes with fighting for a day. */
export const SHORE_UP_COST = 120;
