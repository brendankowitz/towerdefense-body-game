/** Board coordinate space. Prototype line 910: viewBox "0 0 374 430". */
export const BOARD_WIDTH = 374;
export const BOARD_HEIGHT = 430;

export const STEP_SECONDS = 1 / 60;
export const FAST_MULTIPLIER = 2;

export const TISSUE_PIPS = 5;
export const IMMUNITY_MAX = 3;
export const TOWER_MAX_HP = 100;
export const BUILD_SPOT_RADIUS = 24;

/**
 * How far a mount point may sit from the build spot it clusters around.
 *
 * **Not swept, and the skip is logged by the instrument itself.** Nothing reads this at runtime:
 * it is the bound `content.invariants.test.ts` holds authored mounts inside, so moving it changes
 * no simulation and measures nothing at all until eleven boards have been re-authored against the
 * new bound. `arrivals.sweep.ts` prints that on every run rather than leaving a reader to notice
 * an absence, and the response landed where it was aimed at the current placement — so the honest
 * record is that this was left alone, not a number nobody measured.
 *
 * What *was* measured about the placement is how much the second mount of each case is worth,
 * which is the axis this bound governs the most: the note on the mounts in `cases.ts` has it.
 */
export const MOUNT_CLUSTER_RADIUS = 60;

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
 * `OUTBREAK_INTERVAL` is days between new doors opening. `SIEGE_BASE_DAYS` is the days of wall every
 * held region gets on top of the immunity behind it, so a wall is `SIEGE_BASE_DAYS + response`.
 * `DOOR_RESIST_PER_CLEAR` is the chance one clear of a strain buys that an outbreak of it never
 * takes hold.
 *
 * **`SIEGE_BASE_DAYS` used to be described as "how long ground with no immunity behind it holds",
 * and that state does not exist.** `clearCase` raises the strain's immunity in the same expression
 * that holds the region, and immunity never falls, so every held region has at least one point of
 * its own strain behind it. Measured across all eleven cases on a fresh profile: `wallDays = 2` at
 * the shipped base, never `SIEGE_BASE_DAYS + 0`. The reachable range is `base + 1` to `base + 3`.
 * A whole choice was once argued from the unreachable end of that; the note on the constant records
 * what replaced it.
 *
 * ---
 *
 * **All three were placeholders and all three have now been swept.** 100 seeds per cell, both case
 * policies, under the `'learning'` fight policy — the axis the numbers are chosen against, and the
 * one whose direction of error `playRun.ts` states rather than assumes. `'stumbling'` was measured
 * across the whole `OUTBREAK_INTERVAL` spread and dropped from the later sweeps: it loses 100 per
 * cent of runs by day 13 to 27 at *every* value of *every* constant, so it brackets the season
 * without discriminating between settings of it. `'learned'` resolves no runs at all and cannot be
 * tuned against.
 *
 * **Every number here was re-measured after a defect in the harness's rng.** The player's board
 * draws and the sickness's door draws ran off the same mulberry32 sequence, so the first variate
 * that chose a run's opening door was the identical variate that chose its first board. Replay was
 * unaffected — which is why no determinism test caught it — but the sample was biased in exactly
 * the fight policy these were chosen against. `OUTBREAK_INTERVAL` moved as a result. Anything
 * measured against this harness before that fix should be re-run before it is trusted.
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
 * **What the three chosen together produce**, at 200 seeds — twice the sample the choices were made
 * on — by `npm run sweep:runs`, `'learning'`, nearestToCore / cheapest:
 *
 *     won 48% / 46%   lost 32% / 40%   unresolved 21% / 14%
 *     median run 121 / 98 days   held 9 / 8 of 10   core reached 32% / 42%
 *
 * All three targets met on both policies.
 *
 * **That reading is a re-measurement, and what changed was the model rather than any number here.**
 * `seedOutbreak` used to filter its candidate doors against `infected` and not against `held`, so a
 * seeding day could open a door the player was standing on — and the region then sat in both lists
 * for the rest of the run, because no siege is ever opened against ground already infected. Closing
 * it changes which door a roll can pick and, once the body holds every door, whether the roll is
 * taken at all, so every seed diverges and the sample is effectively re-drawn. Against the previous
 * reading every share moved by two points or less, which is inside the roughly three-and-a-half
 * point standard error at 200 seeds; the largest single move is the `cheapest` median run, 113 days
 * to 98, and that is the figure to watch if any of these is swept again.
 *
 * **The per-step tables below have not been re-run since that fix.** They were measured on a model
 * in which a wall standing at a door could be bypassed by a roll — which is the thing two of these
 * three levers exist to prevent — so what each was worth per step was measured against a weaker
 * version of what it buys. The shipped combination above is the reading that has been re-measured;
 * the tables are the provenance for why each value was chosen, and should be re-swept before any of
 * the three is moved.
 *
 * Re-run that sweep and re-read this block before moving any of the three below; the numbers under
 * each are what one step of it was worth, and they are the only reason any of them is the value it
 * is.
 */

/**
 * **Worth per step: 4 to 16 points of loss share, and the only one of the three that moves
 * anything.** Swept over 2, 3, 4, 5 at **100 seeds a cell** (nearestToCore / cheapest); every
 * column is the shipped `SIEGE_BASE_DAYS` and `DOOR_RESIST_PER_CLEAR`:
 *
 *     OI=2  lost 39% / 53%   core 40% / 55%   unresolved 27% / 15%   median run 110 /  24 days
 *     OI=3  lost 35% / 43%   core 35% / 44%   unresolved 21% / 11%   median run 116 / 113 days
 *     OI=4  lost 30% / 27%   core 30% / 27%   unresolved 20% / 14%   median run 128 / 119 days
 *     OI=5  lost 28% / 31%   core 29% / 32%   unresolved 22% / 14%   median run 137 / 133 days
 *
 * **2 is out on target 2**: the median `cheapest` run ends on **day 24 holding 2 regions**, over
 * before there was a wall to defend. 3, 4 and 5 all meet all three targets, so the choice is made on
 * **margin**, and that is not a tie-break of last resort — it is the finding. At 4 the `cheapest`
 * loss share is 27% against a 25% floor and the core is reached in 27% against the same floor: two
 * points, against a standard error of about four and a half at 100 seeds. **The same cell measured
 * 20% — below the floor — at 40 seeds.** A value whose worst reading changes side depending on the
 * sample is not a value that meets the target; it is one that sometimes does.
 *
 * 3 clears every target on both policies by **10 points or more** at its worst cell, and gives up
 * nothing to do it: unresolved is 21% / 11%, the lowest `cheapest` figure in the table, and the
 * median run is 116 / 113 days, which is a long way past target 2.
 *
 * The direction above 4 is the one already known: every further step buys a lower loss share by
 * turning runs into non-endings rather than into wins, because a player who outruns the seeding is
 * never offered the three doorless interior regions and can never hold all ten.
 */
export const OUTBREAK_INTERVAL = 3;

/**
 * **Worth per step: nothing measurable.** Swept over 0, 1, 2, 3 at **`OUTBREAK_INTERVAL` 4** — the
 * value that shipped when the sweep ran, not the 3 that ships now — at **100 seeds a cell** rather
 * than 40, because a claim that a lever is inert deserves more sample than a claim that it is not
 * (nearestToCore / cheapest):
 *
 *     SBD=0  lost 28% / 39%   unresolved 21% / 10%   median run 134 / 114 days
 *     SBD=1  lost 30% / 27%   unresolved 20% / 14%   median run 128 / 119 days
 *     SBD=2  lost 28% / 31%   unresolved 21% / 16%   median run 131 / 120 days
 *     SBD=3  lost 29% / 30%   unresolved 21% / 16%   median run 117 / 119 days
 *
 * `nearestToCore` moves by two points across the whole range, which is well inside a 4.5-point
 * standard error. `cheapest` scatters by twelve with no monotone trend. **The run does not care, and
 * that is the measurement.** The reason it does not is structural: two of the six roads to the core
 * are joints, no case is fought over them, so no wall can ever stand on them — the sickness takes a
 * third of its approach for free whatever this number is.
 *
 * ---
 *
 * **Measuring it flat licenses choosing it on what it makes true, and the argument that used to be
 * here was false.** It claimed 0 was unavailable because it would make a freshly cleared region
 * fall the day the sickness arrived, and that a wall at base 1 holds four times a fresh one. Both
 * assume a held region with zero immunity behind it. **There is no such thing**: `clearCase` raises
 * the strain in the same expression that holds the region, so `wallDays` is `base + 1` at worst —
 * measured as 2 for all eleven cases at the shipped base. The reachable range is `base + 1` to
 * `base + 3`, which makes the immunity ratio 3x at base 0 and 2x at base 1.
 *
 * **So the ratio argument, honestly applied, favours 0 — the value it was used to rule out.** What
 * outweighs it is a layering property, and it is the one thing here that is checkable rather than
 * aesthetic. `front.ts` is a pure, total module that takes `immunity` as an argument and knows
 * nothing about who earned it. At base 1 and above, `stepSickness` guarantees that held ground costs
 * the sickness a step **for any immunity it is handed**, all-zero included. At base 0 that guarantee
 * stops being a property of this layer and becomes a coincidence of how `progression.ts` happens to
 * order two writes in one expression, across a module boundary, with nothing enforcing it.
 * `front.test.ts`'s "cannot walk through ground the player holds" already encodes the guarantee
 * against `NO_IMMUNITY`, and it would go red at 0.
 *
 * The design doc cannot break the tie, and it was a mistake to reach for it: "breaking a wall costs
 * `response + 1` days" reads as base 0 if the count is total steps to break and base 1 if it is days
 * the region is visibly under siege, and the shipped loop makes those different numbers.
 *
 * **1 is therefore the smallest base that keeps the guarantee inside the layer that makes it**, and
 * the run is measured not to care either way. If the joint-wall gap is ever closed — a case on a
 * road the sickness must besiege — this becomes a live lever and should be re-swept before it is
 * trusted.
 *
 * **Provenance, exactly.** The table above was measured at `OUTBREAK_INTERVAL` 4 and was not re-run
 * when that moved to 3. Deliberate: the lever measured inert at 40 seeds under the old rng and at
 * 100 under the new one, and the reason it is inert — a third of the core's approach is joints no
 * wall can stand on — does not depend on how often doors open. A re-sweep would cost half an hour to
 * confirm a structural fact. Whoever closes the joint gap should re-sweep at the shipped interval.
 */
export const SIEGE_BASE_DAYS = 1;

/**
 * **Worth per step: nothing at all up to 0.25, and then a cliff.** Swept over 0, 0.15, 0.25, 0.34,
 * 0.5 at `OUTBREAK_INTERVAL` 3 and `SIEGE_BASE_DAYS` 1, 100 seeds a cell (nearestToCore / cheapest):
 *
 *     DR=0     won 44% / 43%   lost 35% / 49%   unresolved 21% /  8%
 *     DR=0.15  won 44% / 46%   lost 34% / 45%   unresolved 22% /  9%
 *     DR=0.25  won 44% / 46%   lost 35% / 43%   unresolved 21% / 11%
 *     DR=0.34  won 32% / 31%   lost 33% / 39%   unresolved 35% / 30%
 *     DR=0.5   won 28% / 28%   lost 32% / 33%   unresolved 40% / 39%
 *
 * The `won` row is carried here rather than left in a report, because it is the row that would argue
 * against this value if it were going to. It does not: 0.15 and 0.25 are identical on it. An earlier
 * 40-seed pass had 0.15 ahead on `cheapest` wins by seven points and that difference did not survive
 * resampling.
 *
 * The loss share is flat across the whole spread. What moves is the share of runs that **stop being
 * able to end**, and it moves between 0.25 and 0.34 for an exact reason: `MAX_DOOR_RESISTANCE` is
 * `IMMUNITY_MAX * DOOR_RESIST_PER_CLEAR`, so at 1/3 and above a door whose strain the run has beaten
 * three times can **never** open again. Past that point a player who gets ahead seals the body, the
 * seeding stops, the three doorless interior regions are never offered, and the run cannot reach the
 * ten-region win — which is why wins fall by twelve points while losses do not move at all. The
 * lever is not difficulty; past a third it is an off switch.
 *
 * **0.25 is the largest value on the safe side of that cliff, and it is the choice.** It gives a
 * 0 / 25 / 50 / 75 per cent ladder a player can read off the immunity screen, and it leaves a
 * quarter chance at full immunity that the door opens anyway — so no door is ever closed, which is
 * the thing the run needs to stay endable.
 */
export const DOOR_RESIST_PER_CLEAR = 0.25;

/** Bank spent to add one day to a wall. The only thing that competes with fighting for a day. */
export const SHORE_UP_COST = 120;

/**
 * Whether earned immunity sends help to the board at all.
 *
 * **On, and this is the measurement that turned it on.** `tests/sweep/arrivals.sweep.ts` plays the
 * whole board space of all eleven cases — 66,600 boards — at no memory and at each of the three
 * points of it, and it was run twice: once with this flag off, which measures what the three
 * strain vaccines are worth on their own, and once with it on. Subtracting gives the response by
 * itself, exactly, because both runs enumerate the same finite space on a deterministic simulation
 * and neither carries sampling error.
 *
 *     memory       vaccines only     with the response      the response alone
 *     1                    +0.0pp                +1.5pp                  +1.5pp
 *     2                    +0.0pp                +2.7pp                  +2.7pp
 *     3                    +4.5pp                +8.6pp                  +4.1pp
 *
 * Against a season baseline of 5.3% of boards clearing. Two things in that table matter more than
 * the numbers. The first is that **memory 1 and memory 2 measure exactly zero with the flag off —
 * not one board of 66,600 changes hands** — which is the standing proof that below `IMMUNITY_MAX`
 * nothing in the simulation reads `state.immunity` except the response: the tetanus bounce, Flu B
 * and the biofilm serum are every other reader and all three are `>= IMMUNITY_MAX` tests. The
 * comparison's whole method rests on that, and it is measured rather than argued.
 *
 * The second is the ceiling every dial below was chosen against, which the same table hands over:
 * the response at full memory is worth **less than the three vaccines it arrives alongside**, +4.1
 * against +4.5. The immunity screen tells the player about the vaccine and says nothing about the
 * arrival, so a response worth more than the thing the screen names would make the advertised half
 * of memory the smaller half.
 *
 * The eleven rates in `cases.ts` were measured with this off and **every one of them has moved** —
 * six of the eleven leave the 5–15% band at full memory, forearm and throat by more than thirty
 * points. That is Task 10's work, and it is why this flip is committed on its own: the band is
 * asserted by `npm run sweep`, which is not part of `npm run verify`, so the season can be re-tuned
 * against a game that has this on rather than against one that has it off.
 *
 * **Provenance, exactly, because five spreads share it.** Every table below was swept one dial at a
 * time out of the placeholder point, and that point had `KILLER_MIX_CHANCE` at 0.5 where 0.75 now
 * ships — worth +0.3pp of response at full memory. So the tables are the reason each value is what
 * it is, and they are not a reading of the combination that ships; the combination that ships is
 * the run pasted into `.superpowers/sdd/2026-08-01-memory-response/task-9-report.md`, which is
 * where the figures at the top of this block come from. Re-sweep before moving any of them.
 *
 * Typed `boolean` rather than left to infer the literal `true`: every reader of this flag —
 * `step.ts` included — branches on it, and a literal type would make the other branch dead code by
 * construction rather than a runtime decision one flip is meant to change.
 */
export const ARRIVALS_ENABLED: boolean = true;

/**
 * Marks a strain must bank, from `noteRecognition`, before a call for help is even rolled.
 *
 * **Worth per step: the whole of the response's magnitude — it is the dial with the range.** Swept
 * over the season's whole board space, every other dial at the value it ships at. The columns are
 * the response *alone*, with the flag-off control subtracted:
 *
 *     RPC=2   memory 1 +2.9pp   memory 2 +5.7pp   memory 3 +9.2pp   lost/won at memory 1  10%
 *     RPC=3            +2.3             +4.5              +6.9                           13%
 *     RPC=5            +1.5             +2.7              +3.8                           20%
 *     RPC=8            +0.6             +1.3              +3.1                           37%
 *     RPC=12           +0.2             +0.6              +1.6                           66%
 *     RPC=20           +0.2             +0.6              +1.0                           53%
 *     RPC=30           +0.1             +0.2              +0.5                           63%
 *
 * **2 and 3 are out on the ceiling recorded above**: +9.2pp and +6.9pp are both more than the three
 * vaccines' +4.5pp, so the unadvertised half of memory would be the larger half.
 *
 * **8 and above are out for a reason the aggregate hides, and it is the finding of this sweep.**
 * The collateral of a stray mark is nearly *flat* in this dial while the benefit is not: boards
 * lost to the response at one point of memory run 212, 226, 256, 228, 224, 170, 126 down that
 * spread, while boards won run 2128, 1764, 1257, 614, 340, 319, 199. A rarer response is therefore
 * not a gentler one — it is the same amount of interference arriving with less of the help that
 * paid for it, and the last column is what that does. At 5 the first point of memory is worth
 * something on ten of the eleven cases and costs three boards in 7776 on the eleventh (measles,
 * -0.04pp). At 8 and above the hand case goes *negative* at one point of memory — -0.8pp at 8 and
 * -0.9pp at 12 — which is a player handed a memory worse than not having one.
 *
 * 5 clears the ceiling and stays the right side of that floor.
 */
export const RECOGNITION_PER_CALL = 5;

/**
 * Marks one arrival can lay before it is spent and leaves the board.
 *
 * **Worth per step: roughly a point of season clear rate per use, and it does not tail off.**
 * Response alone at full memory, everything else at its shipped value:
 *
 *     USES=1  +1.5pp     USES=2  +2.8pp     USES=3  +3.8pp     USES=5  +5.6pp     USES=8  +7.6pp
 *
 * 5 and 8 are over the vaccine ceiling recorded on `ARRIVALS_ENABLED` (+4.5pp). **3 is the largest
 * value under it**; 1 and 2 give up a point and two points of a response that is already the
 * smaller half of what memory buys.
 *
 * **The display was checked and is not what binds, which is worth writing down because it nearly
 * was.** `ArrivalLayer` lays one pip per remaining use on a circle of `PIP_LAYOUT_RADIUS` with pips
 * of `PIP_RADIUS`, so the clear space between neighbours is `2r*sin(pi/n) - 2R`: 4.39 at three
 * uses, 2.49 at four, 1.05 at five, **0.00 at six**, and negative above. The layout reads as a
 * count up to five and becomes a ring at six. The display ceiling is therefore 5 and the balance
 * ceiling is 3 — anyone raising this past 5 has to re-lay the pips as well as re-measure.
 */
export const ARRIVAL_USES = 3;

/**
 * The chance a call is answered, per point of immunity behind the strain it was banked on — the
 * same shape `DOOR_RESIST_PER_CLEAR` gives a door, because both are "one clear buys this much of a
 * chance" dials on the same `immunity` magnitude.
 *
 * **Worth per step, and a cliff at a third.** Response alone, everything else shipped:
 *
 *     RSP=0.05  memory 1 +0.4pp   memory 2 +0.7pp   memory 3 +1.2pp
 *     RSP=0.10           +0.7             +1.3              +2.0
 *     RSP=0.15           +1.0             +2.0              +2.7
 *     RSP=0.25           +1.5             +2.7              +3.8
 *     RSP=0.34           +2.1             +3.6              +6.1
 *     RSP=0.50           +2.7             +5.1              +6.1
 *
 * **0.34 and 0.50 measured identical at full memory — the same clear count, the same 7261 boards
 * won, the same arrivals.** `callArrivals` rolls against `min(1, immunity * this)`, so at a third
 * and above a call at three points of memory is *always* answered and the top of the ladder stops
 * being a chance at all. That is the cliff, and it is the same shape of finding
 * `DOOR_RESIST_PER_CLEAR` records one tier out: past a third of `IMMUNITY_MAX` the dial stops being
 * difficulty and starts being a switch.
 *
 * Two identities fall out of that table and are the reason to trust it: 0.05 at two points of
 * memory and 0.10 at one point are the same effective chance and measured the same to the board, as
 * did 0.50 at one point and 0.25 at two. The sweep is measuring this model and not something beside
 * it.
 *
 * Both values above the cliff also break the vaccine ceiling (+6.1 against +4.5). **0.25 is the
 * largest value on the safe side of it**, it gives the 25 / 50 / 75 per cent ladder a player can
 * read straight off the three pips on the immunity screen, and it leaves a quarter chance that a
 * call at full memory is not answered — so help is never a certainty.
 */
export const RESPONSE_PER_CLEAR = 0.25;

/**
 * The chance a call at full memory (`IMMUNITY_MAX`) buys a killer instead of another antibody.
 *
 * **Worth per step on the clear rate: nothing ordered.** Swept end to end, response alone at full
 * memory, everything else shipped. The second column is boards the player loses to holding memory
 * and the third is, of the boards it won, the share the baseline had lost on the case's last wave:
 *
 *     KMC=0     +4.0pp   lost 289   won late 43%
 *     KMC=0.25  +3.7          282            45%
 *     KMC=0.50  +3.8          238            46%
 *     KMC=0.75  +4.1          220            48%
 *     KMC=1.00  +4.7          192            47%
 *
 * The first column is not monotone — 4.0, 3.7, 3.8, 4.1 — and moves 0.7 points end to end, so the
 * dial cannot be chosen on it. **The other two are monotone, and that is what it is chosen on**: a
 * larger killer share costs the player fewer boards and rescues boards that were closer to won. The
 * mechanism is the one `stepArrivals` is built around — a killer adds damage without adding a mark,
 * and a mark is what disturbs a fight that was already going the player's way. At 1.00 the
 * collateral of holding memory drops *below* what the three vaccines cost on their own, 192 against
 * the control run's 244.
 *
 * **1.0 is out on the vaccine ceiling** recorded on `ARRIVALS_ENABLED` (+4.7 against +4.5), and it
 * would mean no antibody arrival ever comes at full memory — a killer only ever acts on a mark
 * already laid, so at 1.0 the help is worth exactly what the player's own `anti` cells made it
 * worth. **0 is out because it deletes the killer from the game**: `arrivalKindFor` would never
 * return one, and the killer branch of `stepArrivals`, the second colour in `ArrivalLayer` and the
 * brief's own promise would all be content nothing could reach. 0.75 is the largest value under the
 * ceiling and the best measured value of the two columns that move.
 *
 * **Two of the eleven cases do not obey this dial at all, and that is a defect rather than a
 * rounding.** `createSimState` seeds every board's rng at 0, so on a case where nothing *else*
 * draws from it, every board reaches its first call having consumed the same variates and draws the
 * same kind roll. Measured on sinus: 24 answered calls over 120 boards, 23 of them rolling 0.944,
 * all 24 coming out antibody. Vesper is the same — 169 answered calls, not one killer. The brief
 * promises a killer at full memory on both (`Brief.tsx` asks `arrivalKindFor(memory, 0)`, which
 * says yes for any positive value here) and neither case can deliver one at any setting under
 * 0.944. It is not this dial's to fix.
 *
 * Below `IMMUNITY_MAX` this is never read at all — `arrivalKindFor` sends only antibodies there,
 * which is the fact about the biology rather than a dial, and the sweep says so from the
 * measurement: across the whole spread above, the memory-1 and memory-2 clear counts do not move by
 * a single board out of 66,600.
 */
export const KILLER_MIX_CHANCE = 0.75;

/**
 * Damage a killer arrival deals to the one marked body it hits, applied the same way `nk`'s own
 * `dmg` is: straight off `hp`, scaled by `armourMultiplier`. That multiplier is always 1 here in
 * practice — a killer arrival can only ever reach a body `isTagged` already says is marked, and
 * `armourMultiplier` drops armour for exactly that case — so calling it costs nothing and keeps
 * this on the one path every other damage source in the game already goes through, rather than a
 * second one invented beside it.
 *
 * Started at `nk`'s own `dmg` (`content/defenders.ts`) rather than a fresh guess, since it is the
 * paid cell this arrival stands in for and a free copy of it should not simply out-hit it — a
 * literal here rather than an import of that value, because `defenders.ts` already imports from
 * this module and a value cannot import back across that edge.
 *
 * **Worth per step: 0.3 of a point up to the paid cell's damage, and almost nothing above it.**
 * Response alone at full memory, swept at `KILLER_MIX_CHANCE` 0.5 and everything else shipped:
 *
 *     KD=29  +3.5pp     KD=58  +3.8pp     KD=87  +4.0pp     KD=116  +4.1pp
 *
 * Halving it costs 0.3 points; doubling it buys 0.2 and tripling it 0.3. The knee is at the value
 * it started on, and that is the argument for keeping it: a killer arrival is spent on the one hit
 * it lands, so what decides a fight is how many bodies it can finish rather than by how much it
 * overkills each one, and past `nk`'s own damage most of the extra lands on things already dead.
 * Paying a free arrival more than the cell it stands in for buys a tenth of a point.
 */
export const KILLER_DAMAGE = 58;
