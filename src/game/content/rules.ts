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
 * The front line, and every number it runs on. All four are pacing values and pacing is a property
 * of a whole run, so none of them may be chosen by feel — `tests/sweep/runSweep.ts` is the
 * instrument that measures them and the only thing that should move them.
 *
 * `OUTBREAK_INTERVAL` is days between new doors opening. `SIEGE_BASE_DAYS` is how long ground with
 * no immunity behind it holds, so a wall is `SIEGE_BASE_DAYS + response`. `DOOR_RESIST_PER_CLEAR`
 * is the chance one clear of a strain buys that an outbreak of it never takes hold.
 */
export const OUTBREAK_INTERVAL = 4;
export const SIEGE_BASE_DAYS = 1;
export const DOOR_RESIST_PER_CLEAR = 0.25;

/** Bank spent to add one day to a wall. The only thing that competes with fighting for a day. */
export const SHORE_UP_COST = 120;
