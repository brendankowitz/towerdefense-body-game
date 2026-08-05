import { INFLAMMATION_PER_PIP } from './rules';
import { STRAIN_NAME } from './vaccines';
import type { CaseId, CaseRuleKind, BodyNodeId, PathogenKind, Point, StrainId, Tier } from '../types';

export interface WaveEntry {
  readonly kind: PathogenKind;
  readonly count: number;
}

/**
 * One rule a case is played under, with the copy that states it.
 *
 * The label and the sentence sit on the rule rather than on the case because a compound case has
 * two of each, and a case that carried `ruleLabel` and `ruleSub` as its own fields could only ever
 * name one of them. The brief renders one card per entry, in this order.
 */
export interface CaseRule {
  readonly kind: CaseRuleKind;
  readonly label: string;
  readonly sub: string;
}

export interface CaseDefinition {
  readonly id: CaseId;
  readonly node: BodyNodeId;
  readonly region: string;
  readonly title: string;
  /**
   * Non-empty by construction: a case with no rule is a path with a wave table, and every screen
   * that names what makes this region different would have nothing to print.
   */
  readonly rules: readonly [CaseRule, ...CaseRule[]];
  /**
   * The strain this case's clears count toward. The prototype credited `illness === 'virus'
   * ? 'virus' : 'staph'`, so stomach (illness 'poison') always credited staph and film immunity
   * could never reach 3 — the Biofilm serum sat at 0/3 forever. Each case now declares its
   * credited strain explicitly, so every vaccine has exactly one case that earns it.
   */
  readonly credits: StrainId;
  /**
   * The content naming policy, as data, because the season timeline shows it.
   *
   * Tier 1 is an everyday illness named freely; tier 2 is a real disease named only because the
   * mechanic it carries is the one it actually has; tier 3 is invented. It used to be hardcoded to
   * 1 for every case in `seasonRows`, which was true while every case was a scrape or a bug — and
   * stopped being true the moment measles became playable. The screen's own naming-policy card
   * offers measles as *the* example of a tier 2, so a row reading EVERYDAY under that paragraph
   * was the copy disagreeing with itself in one viewport.
   */
  readonly tier: Tier;
  /**
   * The immunity this case takes away for its own duration — the amnesia rule, and the whole of
   * its data. `createSimState` reads it and masks that strain to zero; the profile keeps what it
   * earned. Only an `amnesia` case carries one, and never the strain it credits: the brief shows
   * the held copy of whichever strain a case credits, and a case that both wiped and credited a
   * strain would print "vaccine held" over a board where it does nothing.
   */
  readonly wipes?: StrainId;
  readonly story: string;
  readonly startingEnergy: number;
  readonly waves: readonly (readonly WaveEntry[])[];
  readonly path: readonly Point[];
  readonly spots: readonly Point[];
  /**
   * Where earned immunity can send help — antibodies that mark, and later killers that can only
   * kill what is marked (spec: memory response). Clustered on the build spots rather than spread
   * to fill gaps: the body reinforces where the player committed, so help arriving beside the
   * cells the player chose to place is what makes that placement matter more. Help arriving
   * wherever the board is weakest would be the game quietly correcting a bad board instead.
   *
   * Held to the same dwell floor as a build spot (`content.invariants.test.ts`, "mount points") —
   * a mount covering nothing is help arriving where nothing can happen, the same dead-content
   * defect as an unusable spot one tier out.
   *
   * **Two per case, and that was measured rather than kept.** `arrivals.sweep.ts` was run over the
   * whole season with the second mount of every case truncated away, against the same run with
   * both. Re-measured after the arrival rolls were decorrelated (`callSeed`), at the shipped
   * tuning. What the second mount is worth, per case, on the response alone at full memory:
   *
   *     forearm +10.7pp   throat +8.4   stomach +6.6   measles +3.8   hand +1.8   relapse +1.3
   *     blister +1.2   bronchitis +1.1   vesper +0.2   heart -0.1   sinus -0.1
   *
   * — and +1.55pp over the season, against +2.90pp for the first mount alone and +4.45pp for both.
   * So the second mount carries about a third of the effect and the first carries two thirds, which
   * is the answer to the question that decides whether to author a third: it is not the second
   * mount doing all the work, so there is no evidence that a third would do any. Adding one means a
   * grid search per case against the vessel, eleven times, to buy a third helping of a diminishing
   * return — so it was not done, and this is the measurement that says why not.
   *
   * **One mount is not a shippable alternative anyway**, which the re-measurement added: truncated
   * to one, the hand case goes to -0.37pp at a single point of memory, so a player who had beaten
   * that strain once would be handed a memory worse than not having one. Two clears that floor on
   * every case the season has.
   */
  readonly mounts: readonly Point[];
}

/**
 * The rules a case meets more than once, written once.
 *
 * The season's design is that every rule is met alone before it is met again or combined, so three
 * of them appear in two cases each. Copy that was retyped per case would drift — the bleed line
 * already existed twice, word for word, and a retune of `BLEED_AMOUNT` would have had to find both
 * — and a player who reads a rule they have already learned should read the same sentence.
 */
const BLEEDING: CaseRule = {
  kind: 'wound',
  label: 'Bleeding',
  sub: 'You lose energy every second until a clot is placed',
};

const TOXIC: CaseRule = {
  kind: 'poison',
  label: 'Toxic',
  sub: 'Pathogens damage your defenders. Antibodies survive toxins far better than phagocytes',
};

const RELAPSING: CaseRule = {
  kind: 'dormant',
  label: 'Relapsing',
  sub: 'Some of what you kill goes down instead of away, and gets back up where it fell',
};

/**
 * The one rule met twice for the same reason it is met at all: nothing is known about a strain
 * that reached the core, because whatever did was the one thing nothing before it stopped. Hiding
 * the wave table is not a mechanic layered on top of that fact — it is the fact, stated as a rule.
 */
const NOVEL: CaseRule = {
  kind: 'novel',
  label: 'Novel',
  sub: 'Nothing is known about this strain — the brief cannot list what is coming, and each wave shows you only what it sends',
};

/**
 * The season, in the order a run meets it. Every case carries the record of what it was tuned with
 * and what each lever was worth; this is the one thing that record cannot say per case.
 *
 * ---
 *
 * **THE MEMORY-RESPONSE RE-MEASUREMENT, after `8e4a966`.**
 *
 * `ARRIVALS_ENABLED` went true and every rate below it was measured before that, so every one of
 * them was suspect. All eleven were re-measured on `npm run sweep` — the instrument `band.ts` is
 * asserted on — against a control that is the identical run with the flag off, which is exactly the
 * game these comments were written in. **Nothing needed a lever moved.** Every case is inside the
 * 5–15% band and both curve checks pass. What follows is the measurement that says so, and the
 * per-case notes below are re-measurements rather than tunings.
 *
 * **The arm matters, and it is not the arrivals sweep's.** `balance.sweep.ts` enters each case at
 * the day *and the immunity* a clean season walk reaches it on — `immunityAfter(daysElapsed)`,
 * which climbs one strain at a time and reaches its cap only at day 10. `arrivals.sweep.ts`'s
 * memory-3 column enters *every* case with all three strains at their cap, which is a re-fight and
 * not a walk. The two disagree by a great deal on the early cases and that is not a contradiction;
 * the note on `forearm` says what to do with it.
 *
 *     case         entry     flag off   flag on   response   help standing (killers)
 *     forearm      0/0/0       14.0%     14.0%      +0.0            0
 *     throat       1/0/0        8.6%      8.6%      +0.0            0
 *     stomach      1/0/1        7.4%     10.1%      +2.7        3,974
 *     hand         1/1/1        5.3%      5.8%      +0.5       14,678
 *     blister      1/2/1        7.7%     12.3%      +4.6       13,121
 *     measles      1/3/1 *      5.9%      6.0%      +0.1        6,148
 *     sinus        1/3/2        8.9%      8.9%      −0.0          407
 *     bronchitis   2/3/2        5.2%      6.1%      +0.9        7,851  (46)
 *     relapse      2/3/3        5.4%     11.2%      +5.8       34,453  (741)
 *     vesper       3/3/3        6.2%      7.0%      +0.8       10,965  (2,194)
 *     heart        3/3/3       13.0%     13.6%      +0.6       17,809  (3,730)
 *
 * Immunity is staph/film/virus. `*` is measles, whose own rule wipes the film it is holding, so it
 * is actually fought at 1/0/1. `help standing` is arrivals seen on a mount at the end of a step,
 * summed over the whole board space — undercounted by construction (`BoardOutcome` in
 * `playBoard.ts` says by how much), so read it as proof help arrived and never as a count of calls.
 *
 * **Three things the table says that no single case's comment can.**
 *
 * **Full memory is not what moves a case.** Vesper and heart are entered at 3/3/3 here — the season
 * finishes every vaccine by day 10 — so they are fought at exactly the profile the arrivals sweep
 * calls memory 3, and they move +0.8 and +0.6, the two smallest positive figures in the column
 * after measles. What moves a case is a wave table every body of which can be *marked*, and those
 * two send an untaggable strain as half of theirs.
 *
 * **The largest mover is the case with the most staph in it.** Relapse sends 15 to 27 staph a wave
 * into two points of staph memory and three of film, and takes the season's biggest step at +5.8.
 * Free marks are worth what the table gives them to mark, which is why the spread here runs from
 * nothing to nearly six points on a feature that has one setting.
 *
 * **A rule can take the response away, and two of them do.** Measles is handed three points of film
 * by day 6 and its own amnesia rule takes exactly those away, so it converts 6,148 arrivals into
 * two boards; sinus charges the player per kill, so free kills are a bill and it *loses* three.
 * Neither was tuned to be true and neither should be tuned away.
 *
 * **How this was measured.** One unnarrowed `npm run sweep` (878s, four gates passed, no hook
 * timeout) plus eleven narrowed `SWEEP_CASES=` runs, and the two **agreed board for board on all
 * eleven cases** — which is what licenses the narrowed runs the per-case notes quote. The flag-off
 * control is those same eleven narrowed runs in a copy of the tree with `ARRIVALS_ENABLED` false.
 *
 * **The control was checked against this file rather than trusted**, since it is the claim the
 * whole before column rests on: six cases below state the rate their tuning pass landed on, and the
 * control reproduces five of them to the tenth — forearm 14.0, hand 5.3, relapse 5.4, vesper 6.2,
 * heart 13.0. **The sixth does not.** Blister's pass recorded 7.2% and the control measures 7.7%,
 * so half a point moved on that case between its pass and `8e4a966` for reasons that are not this
 * feature's. That is a finding about the file and not about the control, and it is written up where
 * it belongs, on the case.
 *
 * **What this round did NOT re-measure, and the trap in it.** Every case below records what its
 * *levers* were worth — a staph is three to four tenths of a point on the hand, sixty starting
 * energy is a point and a half on the forearm, `INFLAMMATION_PER_PIP` 26 to 16 is 11.7 points on
 * the sinus, and so on. **All of those were measured before `8e4a966` and none of them was re-taken
 * here**, because nothing needed a lever moved and a lever nobody moves is a lever nobody measures.
 * They are kept as the record of the passes that chose the numbers, and they should not be trusted
 * as prices for a *future* pass without re-taking them — most of all on the cases the response
 * reaches hardest. A staph on the relapse case is no longer only a body: it is also a body 34,453
 * free arrivals are waiting to mark, and the pass that priced it at four tenths of a point was
 * measuring a game in which none of them existed.
 */
export const CASES: readonly CaseDefinition[] = [
  {
    id: 'forearm', node: 'forearm', region: 'FOREARM · CASE 04', title: 'Deep cut', credits: 'staph', tier: 1,
    story: 'Kitchen knife, two hours ago. The skin is open and bacteria are walking straight in.',
    rules: [BLEEDING],
    // The season's opening case, and the one every other case's rate is measured against. It is
    // deliberately the forgiving one: it clears 14.0% of the three-cell boards a first-day player
    // can build, just inside the band's 15% ceiling.
    //
    // **Starting energy is worth about a point and a half per sixty here**, against the tenth of a
    // point ten energy buys on the hand case: this case bleeds and starts poorest, so energy it has
    // not got is a board it never builds. It also saturates — 320 to 400 bought a single point —
    // and leaning on it further would pay for the opening by making the bleed stop mattering, which
    // is the one thing this case is about.
    //
    // **The Resistant strain came off this table when the dock became a schedule**, and that is not
    // a difficulty decision. Its own note says what to do about it — execute it, or grow a bigger
    // cell — and day one now has neither: the killer cell opens on day 2 and the macrophage on day
    // 5. A phagocyte against 60 per cent armour is six damage a second against 150 health, so the
    // three Resistants this table used to carry were three pips the player could not argue with.
    // Measured: 2.1% of boards clearing with them, **14.0% without**, nothing else changed.
    //
    // The wave tables and the unlock schedule are one schedule, and this is where that first bit.
    // Every pathogen a case sends should have an answer the player has already been handed.
    //
    // **The memory response does not reach this case, and that is structural.** Re-measured after
    // `8e4a966`: 34 of 243, 14.0%, the identical boards the flag-off control clears, with **zero**
    // arrivals standing across the whole board space. It is entered at `immunityAfter(0)`, which is
    // nothing on every strain — so `noteRecognition` banks nothing, `callArrivals` never rolls, and
    // there is no setting of any dial in `rules.ts` that could change that. The opening case is the
    // one case in the season the feature cannot touch in the arm the band is asserted on.
    //
    // **`arrivals.sweep.ts` reports this case at 44.0%, the season's worst number, and that is a
    // different question rather than a contradiction.** That column enters this three-cell, day-one
    // board holding three staph clears and three film clears, which is a profile no run has on day
    // one — it is a *re-fight* by a player who already holds everything. This case is small enough
    // (243 boards, three defender kinds) that one free arrival is a large share of the board's whole
    // firepower, so it is the most sensitive case in the season to that entry and the least
    // sensitive to this one. The instrument for a re-fight is `runSweep.ts`, which plays a case at
    // the day and immunity runs actually arrive with; it has not been re-run since arrivals were
    // turned on. Deliberately not tuned to here — see the Task 10 report for the measurement and
    // the recommendation.
    startingEnergy: 320,
    waves: [
      [{ kind: 'staph', count: 8 }],
      [{ kind: 'staph', count: 13 }],
      [{ kind: 'staph', count: 12 }, { kind: 'film', count: 3 }],
      [{ kind: 'staph', count: 15 }, { kind: 'film', count: 4 }],
      [{ kind: 'staph', count: 17 }, { kind: 'film', count: 5 }],
    ],
    // **A limb, so the vessel crosses it.** In at the wrist and out at the elbow: this is the one
    // case in the season that runs left to right and never reaches the floor, which is what a
    // forearm looks like from above. Reshaped in the retrofit — see the note on `throat` for what
    // the seven of these were before, and `2026-07-31-season-shape-review.md` for why.
    path: [[-24, 120], [90, 140], [166, 96], [252, 140], [286, 226], [220, 288], [300, 340], [398, 322]],
    // Spot 4 is the case's one long reach, at 0.3 seconds of vessel for a phagocyte and a real
    // stretch for an antibody. It is deliberate and it is the same trade the old board's spot 4
    // carried: a spot far from the vessel should demand range. What it may not be is a spot no
    // *two* cells can use — see `content.invariants.test.ts`, build spots.
    spots: [[114, 78], [288, 144], [204, 324], [162, 180], [198, 30]],
    // Grid-searched within MOUNT_CLUSTER_RADIUS of spot 1 and spot 3 for a stretch of vessel the
    // opening cell clears the dwell floor on — see content.invariants.test.ts, "mount points".
    mounts: [[130, 122], [260, 336]],
  },
  {
    id: 'throat', node: 'throat', region: 'THROAT · CASE 05', title: 'Flu', credits: 'virus', tier: 1,
    story: 'Someone coughed on the train. The virus is already copying itself in your throat.',
    rules: [{ kind: 'virus', label: 'Multiplying', sub: 'Every virus that dies splits into two smaller ones' }],
    // Day 2 opens the killer cell, so this is the first case that can answer a Resistant — and the
    // first that sends one, in its last wave. Starting energy carries the rest: at four cells the
    // board is a third smaller than it used to be, and the wave that kills three boards in four is
    // the first one.
    //
    // **The memory response does not reach this case either, for a sharper reason than forearm's.**
    // Re-measured after `8e4a966`: 88 of 1024, 8.6%, identical to the flag-off control, with
    // **zero** arrivals standing. This case *is* entered holding memory — one point of staph, from
    // the forearm — and this table sends no staph at all. Every body in it is a virus, a spore, a
    // film or an MRSA, and `noteRecognition` banks only for a strain the profile is already above
    // zero on. A case can hold memory and still never make a call, and this is the one that does.
    //
    // That makes it the cleanest control in the season: it is the only case where the response is
    // silent for a reason a wave table could change rather than a reason the season order fixes.
    // Moving one staph into any wave here would switch the feature on for this case; nothing was
    // moved, because the case is inside the band as it stands.
    startingEnergy: 380,
    waves: [
      [{ kind: 'virus', count: 6 }],
      [{ kind: 'virus', count: 9 }, { kind: 'spore', count: 2 }],
      [{ kind: 'virus', count: 11 }, { kind: 'spore', count: 4 }],
      [{ kind: 'virus', count: 13 }, { kind: 'spore', count: 5 }, { kind: 'film', count: 3 }],
      [{ kind: 'virus', count: 16 }, { kind: 'spore', count: 6 }, { kind: 'mrsa', count: 2 }],
    ],
    // **The retrofit, and this comment is the record of it for all seven cases it touched.**
    //
    // Days 1 to 7 were authored one at a time against a clear rate, and came out as one board seven
    // times: every vessel entered at `x = -24` in the upper third and left through the floor, 32 to
    // 48 per cent of every path ran downward and at most 9 per cent ran up, and the five spots sat a
    // mean 53 to 65 units off the vessel in all seven. The rule was the only thing that changed.
    // `2026-07-31-season-shape-review.md` measured it; this is the fix.
    //
    // **Each case now has an entry edge, an exit edge and a shape of its own**, and no two of the
    // ten share a pair. Throat comes down from the head and turns out toward the chest — the only
    // case that leaves by the left.
    //
    // **The balance came across intact, and that is the technique rather than luck.** Clear rate
    // tracks total spot coverage far more than it tracks path shape, so each board's five spots were
    // placed to reproduce that case's *existing* per-spot dwell profile — same firepower, new
    // ground. Measured against the seven rates before the retrofit, every case landed within a point
    // of where it was, and no case needed a wave table touched.
    path: [[186, -24], [178, 68], [96, 110], [104, 196], [212, 226], [268, 300], [186, 356], [86, 330], [-24, 356]],
    spots: [[138, 126], [150, 246], [300, 320], [292, 268], [210, 144]],
    mounts: [[114, 126], [240, 320]],
  },
  {
    id: 'stomach', node: 'stomach', region: 'STOMACH · CASE 06', title: 'Food poisoning', credits: 'film', tier: 1,
    story: 'The shellfish. Toxins are going after your own cells instead of the tissue.',
    rules: [TOXIC],
    // **The first case in the season the memory response reaches at all.** Re-measured after
    // `8e4a966`: 230 → 315 of 3125, **7.4% → 10.1%**, +2.7 points off 3,974 arrivals and no
    // killers. It is the first case whose table sends a strain the profile already remembers — one
    // point of staph, from the forearm — and `arrivalKindFor` gates the killer on `IMMUNITY_MAX`,
    // which nothing has reached by day 3, so every arrival here is an antibody.
    //
    // The step is worth stating beside the geometry note below, because they point opposite ways:
    // this case's identity is that position is a liability, and a free mark is position the player
    // did not have to pay for. It is still comfortably inside the band at both ends, so no spot was
    // moved — and moving one is the wrong first reach here anyway, for the reason the note on
    // `POISON_RADIUS` in the season-shape review gives: this case has an interior optimum for spot
    // distance and both sides of it are cliffs.
    startingEnergy: 320,
    waves: [
      [{ kind: 'staph', count: 12 }, { kind: 'toxin', count: 3 }],
      [{ kind: 'staph', count: 12 }, { kind: 'toxin', count: 5 }, { kind: 'film', count: 3 }],
      [{ kind: 'staph', count: 16 }, { kind: 'toxin', count: 6 }, { kind: 'spore', count: 4 }],
      [{ kind: 'staph', count: 19 }, { kind: 'toxin', count: 8 }, { kind: 'film', count: 6 }],
      [{ kind: 'staph', count: 22 }, { kind: 'toxin', count: 10 }, { kind: 'film', count: 7 }, { kind: 'mrsa', count: 3 }],
    ],
    // A sac, so the vessel goes in and comes back out the way it came: the only case in the season
    // that enters and leaves by the same edge, and the only one a body can be carried most of the
    // way round before it reaches anything.
    path: [[110, -24], [116, 88], [58, 168], [96, 268], [200, 310], [292, 250], [286, 148], [232, 92], [268, -24]],
    spots: [[248, 192], [148, 164], [36, 300], [208, 380], [340, 304]],
    mounts: [[96, 136], [276, 244]],
  },
  {
    // Credits film because a biofilm is what lives in a splinter site, and Biofilm's serum drops
    // armour wherever it is met, so the brief's held copy is true here.
    //
    // It was originally credited film to dodge a broken promise as well: Tetanus's copy said the
    // first staph of every wave bounces off, `applySpawn` only bounces one in a `wound` case, and
    // the brief shows the held copy of whichever strain a case credits. That disagreement is
    // settled — the copy now says "in a wound", see `vaccines.ts` — so a later non-wound case is
    // free to credit staph. This one still should not, on the fiction alone.
    id: 'hand', node: 'handR', region: 'HAND · CASE 07', title: 'Splinter', credits: 'film', tier: 1,
    story: 'You pulled the splinter out last week. Something came in with it and stayed.',
    rules: [RELAPSING],
    // Fifteen measured passes to land inside the band and under the case before it, and two
    // things about the shape of that search are worth the next author's time.
    //
    // **Where mass sits matters more than how much there is.** Moving one staph out of wave 4 and
    // into wave 5 — no change at all to the total — took this case from 5.3% of boards clearing to
    // 4.5%, straight through the floor. Late waves are where runs die, so a body added there is
    // worth several added to wave 1. Retune by moving whole waves, not by counting bodies.
    //
    // **Wave counts are the coarse dial and starting energy is the fine one.** One staph is worth
    // roughly three to four tenths of a percentage point; ten energy is worth about a tenth, which
    // is what the odd-looking 355 is doing — it is the last 0.8 points, bought back after wave 5
    // got the staph that makes this table escalate the way a wave table should read.
    //
    // Those fifteen passes were spent against a gate that gave the case half a point to land in.
    // It no longer exists: the 0.8 measured above is the reason the adjacent-pair staircase was
    // replaced by a trend, and any case after the first is now free anywhere between the floor and
    // the opening case's rate. See `tests/sweep/curve.ts`. Nothing here needs that precision again,
    // and a future case that reaches for it has misread the gate.
    //
    // **After the memory response: 5.3% → 5.8%**, re-measured after `8e4a966`, 409 → 449 of 7776.
    // **+0.5 points off 14,678 arrivals** — the most help delivered to any case in the first eight,
    // and close to the least done with it: **2.7 boards a thousand arrivals**, against stomach's
    // twenty-one and blister's twenty-seven off a fraction of the help. Only measles (0.3) and the
    // heart (2.4) get less out of an arrival, and measles has a rule that explains it.
    //
    // **Why is not measured here.** The obvious candidate is the rule above — dormancy stands back
    // up what the board killed, so a free mark can be spent on a body that returns unmarked — and
    // nothing run for this re-measurement tested it. It is written down as a candidate rather than
    // as an explanation, because the difference between those two is most of this file's
    // discipline. The case is inside the band and this is the direction that costs it nothing, so
    // nothing was moved.
    startingEnergy: 400,
    waves: [
      [{ kind: 'staph', count: 10 }, { kind: 'spore', count: 3 }],
      [{ kind: 'staph', count: 13 }, { kind: 'spore', count: 4 }, { kind: 'film', count: 3 }],
      [{ kind: 'staph', count: 14 }, { kind: 'spore', count: 5 }, { kind: 'film', count: 4 }],
      [{ kind: 'staph', count: 18 }, { kind: 'spore', count: 6 }, { kind: 'film', count: 5 }, { kind: 'mrsa', count: 2 }],
      [{ kind: 'staph', count: 19 }, { kind: 'spore', count: 8 }, { kind: 'film', count: 6 }, { kind: 'mrsa', count: 3 }],
    ],
    // A splinter track: in at the fingers, folded back on itself twice, out through the wrist. It
    // is the season's one case that comes in from the right and leaves through the floor, and it
    // keeps the property the old board had — every one of its five spots holds something for the
    // cheapest cell in the dock for a second or more, so none of them is a reach demand.
    path: [[398, 110], [300, 96], [212, 140], [148, 92], [72, 130], [64, 226], [148, 268], [140, 356], [216, 396], [212, 454]],
    spots: [[132, 162], [72, 264], [348, 36], [348, 174], [186, 210]],
    mounts: [[132, 114], [108, 300]],
  },
  {
    // The season's one repeat of a rule, and it is here to be the cheap case: no new mechanic, no
    // new pathogen, no new state — a path, five spots, five waves and the bleed the player already
    // knows. What it changes is the geometry. The vessel doubles back on itself three times, which
    // is more vessel in the same board, and the spots are laid further off it: only one of the five
    // holds anything for a phagocyte for more than three seconds, against three of forearm's five.
    //
    // **Three measured passes, and the second one taught the useful thing.** Opening at 11.2% of
    // boards clearing, the obvious lever was late-wave mass — so wave 5 gained two staph, and the
    // rate went *up*, to 8.9% from the 8.7% a different change had reached. Two thirds of the
    // boards here never see wave 5, and for the third that does, another staph is another bounty
    // and another cell. Mass late is the lever on a case players survive to the end of; this is not
    // one. Starting energy is, and it did the work: 300 to 270 was worth 1.5 points and 270 to 262
    // most of another half, landing at 7.2%.
    //
    // **Credits film, not staph, and that is the amnesia case's requirement rather than this
    // case's preference.** A wipe of an immunity the player has not earned is a rule that does
    // nothing, and a strain needs three clears. Stomach and hand credit film; this is the third,
    // so film reads DONE on the immunity screen exactly one case before measles takes it away.
    // Crediting staph here instead would have left every immunity under three at that point and
    // made the rule after this one inert on a first run. The fiction goes along quietly: a blister
    // that has been walked on for a day is a closed wet pocket, which is where biofilm lives.
    //
    // **After the memory response: 7.7% → 12.3%**, re-measured after `8e4a966`, 597 → 958 of 7776.
    // **+4.6 points off 13,121 arrivals**, the season's second largest step and its best conversion
    // — twenty-seven boards a thousand arrivals against hand's three, on 11% less help.
    //
    // **What makes this case the one the response is best at is the same thing the paragraph above
    // chose it for.** It is the third film case, so it is entered holding *two* points of film, and
    // `callArrivals` answers a call with chance `immunity[strain] * RESPONSE_PER_CLEAR` — so a film
    // call here is answered twice as often as the same call one case earlier. And this table is
    // staph and film and nothing else the profile does not know: every body in it except the spores
    // and the MRSA is a strain the response can bank on. Deep memory crossed with a table made of
    // it, which is the shape the season table on `CASES` names as what actually moves a case.
    //
    // **The 7.2% above is stale, and by more than arrivals.** The flag-off control — the same run
    // with the feature off, which is the game that paragraph was written in — now measures **7.7%**.
    // Half a point moved between that tuning pass and `8e4a966` for reasons that are not this
    // feature's, most likely the antibody mark gaining a real duration (`balance.sweep.ts`'s
    // `BAND_EXCEPTIONS` note records that change bringing the whole curve with it). The pass's own
    // number is left standing as the record of the pass; this is the measurement that supersedes it.
    id: 'blister', node: 'footL', region: 'FOOT · CASE 08', title: 'Blister', credits: 'film', tier: 1,
    story: 'New boots, eleven kilometres. The skin rubbed through this morning and it has not closed.',
    rules: [BLEEDING],
    startingEnergy: 330,
    waves: [
      [{ kind: 'staph', count: 11 }, { kind: 'film', count: 2 }],
      [{ kind: 'staph', count: 14 }, { kind: 'film', count: 3 }],
      [{ kind: 'staph', count: 15 }, { kind: 'film', count: 4 }, { kind: 'spore', count: 3 }],
      [{ kind: 'staph', count: 18 }, { kind: 'film', count: 6 }, { kind: 'spore', count: 4 }, { kind: 'mrsa', count: 1 }],
      [{ kind: 'staph', count: 23 }, { kind: 'film', count: 7 }, { kind: 'spore', count: 5 }, { kind: 'mrsa', count: 3 }],
    ],
    // A closed pocket under the skin: in at the ball of the foot, round the blister and out at the
    // heel, so it is the only case that enters and leaves through the floor. Still the season's
    // longest vessel, which is what the comment above means by more vessel in the same board.
    path: [[96, 454], [104, 356], [50, 286], [80, 186], [166, 128], [258, 158], [292, 246], [232, 306], [148, 288], [120, 372], [214, 410], [268, 454]],
    spots: [[180, 264], [294, 336], [336, 174], [210, 378], [84, 96]],
    mounts: [[166, 418], [228, 232]],
  },
  {
    // Measles, and the reason it is on a lung rather than on "whole body" as the design table has
    // it: there is no whole-body node, and the table is one region short of its own ten cases.
    // Anchoring a systemic illness to the site that actually kills people — measles pneumonia — is
    // the resolution that costs the map nothing. It takes the region the table had pencilled for
    // the finale; an invented strain is the one case in the season with no tie to any organ, so it
    // is the cheapest thing to move.
    //
    // **What is in the waves is not measles.** Measles wrecks the memory and the opportunists walk
    // in behind it, which is what immune amnesia does in life and is why the rule is named for it.
    // So the table is everything the body used to know how to stop.
    //
    // **Four measured passes, and the binding constraint was geometry rather than counts.** This
    // opened at 4.7%, under the floor, with 81% of boards dying on wave 1 — and softening wave 1
    // and adding 30 starting energy moved the rate by nothing at all. The spots were the reason:
    // summed over the five, a phagocyte covered 9.1 seconds of vessel here against forearm's 14.8
    // and hand's 17.2, the thinnest board in the season by a wide margin. Pulling three spots in to
    // 15.0 was worth **+3.5 points** on its own, which is ten times what either count lever bought.
    // A case losing most of its boards to the first wave is a geometry problem wearing a wave
    // table; check the spot coverage before touching a count.
    //
    // **The memory response reaches this case and converts almost none of it, because its own rule
    // is in the way.** Re-measured after `8e4a966`: 461 → 463 of 7776, 5.9% → 6.0%, **two boards**
    // off 6,148 arrivals — 0.3 boards a thousand, the least any case in the season does with an
    // arrival that helps it at all. (Sinus does worse still, but it does worse by *losing* boards,
    // which is a different fact and has its own note.) The season hands it three points of film by
    // day 6 and the amnesia rule takes exactly
    // those away, so it is fought at 1/0/1: film is wiped and `createSimState` zeroes it before
    // `noteRecognition` ever sees a body — but film is not the strain its table leans on. The table
    // sends 55 virus across the season against 18 film, so the amnesia rule is taking the case's
    // deepest immunity, not its most-answered strain.
    //
    // The rule was authored for the fiction — immune amnesia is what measles does — and it prices
    // the response as a side effect. No constant was chosen to make that true, and the case is
    // inside the band either way, so nothing here was moved.
    id: 'measles', node: 'lungR', region: 'RIGHT LUNG · CASE 09', title: 'Measles',
    credits: 'virus', tier: 2, wipes: 'film',
    story: 'The rash has already faded. What is in the lung now is everything your body used to know how to stop.',
    rules: [{
      kind: 'amnesia',
      label: 'Amnesia',
      sub: `Your ${STRAIN_NAME.film} immunity is wiped for this case — armour holds, and the profile keeps it`,
    }],
    startingEnergy: 305,
    waves: [
      [{ kind: 'virus', count: 6 }, { kind: 'staph', count: 3 }],
      [{ kind: 'virus', count: 11 }, { kind: 'film', count: 3 }, { kind: 'staph', count: 5 }],
      [{ kind: 'virus', count: 11 }, { kind: 'film', count: 4 }, { kind: 'spore', count: 3 }],
      [{ kind: 'virus', count: 12 }, { kind: 'film', count: 6 }, { kind: 'spore', count: 4 }, { kind: 'mrsa', count: 1 }],
      [{ kind: 'virus', count: 15 }, { kind: 'film', count: 5 }, { kind: 'spore', count: 5 }, { kind: 'mrsa', count: 2 }],
    ],
    // Down the airway from above and out into the chest on the right. The retrofit kept this
    // case's coverage to the unit — it is the one that taught the season that geometry is worth
    // ten times what a wave count is, and it is the last board that should have been re-shaped
    // carelessly.
    path: [[240, -24], [232, 74], [140, 104], [72, 168], [96, 262], [196, 288], [246, 358], [340, 372], [398, 300]],
    spots: [[120, 186], [144, 330], [144, 30], [198, 402], [306, 66]],
    mounts: [[188, 26], [120, 242]],
  },
  {
    // The rule that inverts the loop, and the last case of the season because six cases of
    // killing-is-good is what makes it land as a reversal rather than as a difficulty spike.
    //
    // Two halves, and neither works without the other. Pollen does no damage when it gets through
    // (`PathogenStats.leak`), so the player is *allowed* to let it past — and killing anything at
    // all inflames, so they have to. The staph is what stops "build nothing" being the answer: it
    // costs a pip like everything else in the season does, so the case is lost from both ends and
    // the board has to sit between them.
    //
    // **Five measured passes, of which the first found a broken rule rather than a bad number.**
    // At 0 of 7776 boards, with pollen light enough to die in one action, there was no tuning that
    // would have worked — `pathogens.ts` records why and what changed. Once pollen was heavy the
    // case behaved, and the two dials are very unequal:
    //
    // - **`INFLAMMATION_PER_PIP` is the coarse one.** 26 to 16 was worth 11.7 points, 16 to 12
    //   another 2.1. It saturates fast, and it is also the number the rule line quotes, so pushing
    //   it much lower starts writing copy that reads as a joke.
    // - **Pollen counts are the fine one, at about 0.05 points each** — a fiftieth of what a staph
    //   is worth on any other case, because pollen is not what kills the player here, it is what
    //   tempts them. Fifty more pollen moved 2.6 points.
    //
    // The staph line is thin on purpose. Each one is a pip on the way out, so at three per wave a
    // board that ignores them loses on leaks alone, and the shape of a winning board — measured, it
    // is `nk,nk,anti,clot,clot` — is two cells that do nothing but slow.
    //
    // **The memory response is a liability here and should stay one.** Re-measured after `8e4a966`:
    // 693 → **690** of 7776, 8.9% → 8.9%, a *loss* of three boards off 407 arrivals. It is the only
    // case in the season the feature makes worse, and the reason is the rule above rather than a
    // number: this case charges the player `INFLAMMATION_PER_PIP` per kill, so a free mark and a
    // free kill are a bill and not a gift. `arrivals.sweep.ts` measures the same sign on the other
    // arm — nine boards lost at full memory, none won, at every setting of every dial in `rules.ts`.
    //
    // No constant was chosen to make that true, on either sweep, and none should be chosen to undo
    // it. A case whose whole identity is that killing costs you should charge for free killing too.
    id: 'sinus', node: 'sinus', region: 'SINUS · CASE 10', title: 'Hay fever', credits: 'staph', tier: 1,
    story: 'Grass season. None of what is drifting through here can hurt you, and your body has not been told.',
    rules: [{
      kind: 'allergy',
      label: 'Overreaction',
      sub: `The pollen is harmless. Every ${String(INFLAMMATION_PER_PIP)} things you kill inflames the tissue and costs a pip`,
    }],
    startingEnergy: 300,
    waves: [
      [{ kind: 'pollen', count: 26 }, { kind: 'staph', count: 1 }],
      [{ kind: 'pollen', count: 36 }, { kind: 'staph', count: 2 }],
      [{ kind: 'pollen', count: 44 }, { kind: 'staph', count: 2 }],
      [{ kind: 'pollen', count: 50 }, { kind: 'staph', count: 2 }],
      [{ kind: 'pollen', count: 58 }, { kind: 'staph', count: 3 }],
    ],
    // A sinus drains upward and outward, so this one climbs: in low on the left, round the cavity
    // twice and out through the roof. The pollen is going somewhere it was always going to go.
    path: [[-24, 300], [78, 316], [150, 372], [244, 356], [292, 276], [232, 210], [130, 232], [70, 160], [140, 96], [244, 118], [286, 40], [268, -24]],
    spots: [[54, 198], [150, 276], [288, 180], [348, 312], [66, 396]],
    mounts: [[272, 236], [82, 146]],
  },
  {
    // The season's second multiplying case, and the first one authored against the season-shape
    // report rather than only against the clear rate. What that report said about the seven cases
    // before this one: every vessel entered off the left edge in the upper third and left through
    // the floor, 32 to 48 per cent of every path ran downward and at most 9 per cent ran up, and
    // the five spots sat a mean 53 to 65 units off the vessel in all seven — inside a defender
    // range band 22 units wide. Seven boards, one board.
    //
    // So this one is a corridor rather than a serpentine: it comes in through the **roof**, runs
    // down a narrow column, and the spots sit on the flanks. What that changes for the player is
    // which cells reach — a column is covered from both sides at once, so a short-ranged cell on
    // the flank sees the vessel three times as it zigzags past, and the long-ranged antibody gains
    // far less from its reach than it does on an open board.
    // **Eight measured passes, and the useful finding is that a wave table is a wage.** This opened
    // at 1.5% of boards clearing with 7400 of 7776 dying on wave 1, which reads as "wave 1 is too
    // heavy" and is not. Softening it — six bodies down to five, then to four — moved the rate the
    // wrong way, 4.5% to 3.9%: a board that meets a smaller opening wave collects less bounty and
    // arrives at wave 2 with fewer cells. Every case in the season has this shape, and it is the
    // mirror of the finding the forearm and hand cases record from the other end, where mass
    // removed from a *late* wave was worth several times the same mass removed early.
    //
    // What actually moved it was reach: 10.9 seconds of vessel covered by a phagocyte across the
    // five spots, the thinnest board in the season, pulled in to 19.1. See the season-shape review
    // for the general form of that — spot offset is worth roughly ten times what a body is.
    //
    // **After the memory response: 5.2% → 6.1%**, re-measured after `8e4a966`, 405 → 475 of 7776,
    // +0.9 points off 7,851 arrivals. **The first case in season order a killer ever arrives on** —
    // 46 of them. Every arrival on the seven cases before this one is an antibody, and it takes
    // three conditions at once to change that, which is why it takes until day 8: `arrivalKindFor`
    // gates the killer on `IMMUNITY_MAX`, so the case must *hold* a strain at three, **and** send
    // that strain, **and** not have it wiped. Film reaches three by day 6 — but measles wipes film,
    // and sinus sends only pollen and staph, so neither can spend it. This is the first case that
    // holds film at three and sends film.
    //
    // It is also the case the change buys the most headroom for. 5.2% was two tenths of a point off
    // the band floor, which is the least margin any case in the season had; 6.1% is a point clear
    // of it. The eight passes recorded above were spent getting this case *up* to the floor, and
    // the feature is the first thing since that moved it in the same direction.
    id: 'bronchitis', node: 'lungL', region: 'LEFT LUNG · CASE 11', title: 'Bronchitis', credits: 'virus', tier: 1,
    story: 'The cough that stayed a fortnight. The airway is raw, and everything you break apart leaves two behind.',
    rules: [{ kind: 'virus', label: 'Multiplying', sub: 'Every virus and every Strep that dies splits into two smaller ones' }],
    startingEnergy: 400,
    waves: [
      [{ kind: 'virus', count: 4 }, { kind: 'strep', count: 2 }],
      [{ kind: 'virus', count: 8 }, { kind: 'strep', count: 3 }, { kind: 'spore', count: 2 }],
      [{ kind: 'virus', count: 9 }, { kind: 'strep', count: 5 }, { kind: 'film', count: 2 }],
      [{ kind: 'virus', count: 11 }, { kind: 'strep', count: 6 }, { kind: 'spore', count: 3 }, { kind: 'mrsa', count: 1 }],
      [{ kind: 'virus', count: 13 }, { kind: 'strep', count: 7 }, { kind: 'film', count: 3 }, { kind: 'mrsa', count: 2 }],
    ],
    path: [[150, -24], [158, 96], [92, 168], [200, 240], [96, 312], [186, 372], [176, 454]],
    spots: [[192, 66], [62, 172], [236, 240], [60, 306], [140, 406]],
    mounts: [[102, 128], [124, 402]],
  },
  {
    // The compound case: two rules at once, and the first case in the season that asks the player
    // to hold two answers in mind. It is late for the same reason the design says — every rule is
    // met alone before it is met together, and both of these have been.
    //
    // **The two rules meet in the geometry rather than only in the wave table.** The vessel is a
    // coil, so a cell in the middle of it covers three passes of the same vessel and is the best
    // spot on the board by a distance — and the poison rule charges per body in range (decision
    // D25), so it is also the spot that kills the cell standing on it. Dormancy is what closes the
    // trap: what dies in the coil wakes up in the coil, beside the cell that killed it.
    //
    // **The tuning found the sharpest number in the project, and it has a cliff on both sides.**
    // A coil gives every spot two or three passes of the same vessel, so this opened at 23.4% of
    // boards clearing on 27.7 seconds of phagocyte coverage — half again the season's most generous
    // board. Moving the five spots *out* to 17.0 seconds took it to 4.4%: **eleven points, with the
    // wave table untouched**, against the 0.3 to 0.8 points one body in a wave is worth.
    //
    // Then moving them ~10 units further *in* took it to **0.0%**, and that is the part specific to
    // this case rather than to geometry. `applyPoison` charges per body within `POISON_RADIUS`, 42
    // units — so outside that radius a spot buys coverage and inside it a spot buys a dead cell.
    // Any case carrying the poison rule has an interior optimum for spot distance, and it is narrow.
    //
    // Mass is the wrong dial here for the same reason it is on the bronchitis case: cutting waves 2
    // to 5 by an eighth measured 4.1% to 3.7%. What finally landed it at 5.4% was trading toxins
    // for staph at equal health — the stun is what makes a partial board fail, not the mass.
    //
    // **After the memory response: 5.4% → 11.2%**, re-measured after `8e4a966`, 421 → 874 of 7776.
    // **+5.8 points, the largest step any case in the season takes**, off 34,453 arrivals and 741
    // killers — also the most help delivered to any case anywhere in the sweep, 1.93 times the
    // next (the heart, at 17,809).
    //
    // **The last tuning pass is why, and it is the same sentence read the other way round.** What
    // landed this case at 5.4% was trading toxins for staph, and staph is the one strain the
    // profile is deepest in by day 9. The table now sends 15 to 27 of them a wave into two points
    // of staph memory and three of film, so nearly every body that dies here is one
    // `noteRecognition` banks. A lever chosen for what the stun does turned out to be the lever
    // that decides how much free help this case attracts, and nothing measured that at the time
    // because the feature did not exist.
    //
    // It is now the third-easiest board on the curve, behind forearm at 14.0% and blister at 12.3%,
    // and still 2.8 points under the case the season opens with — so `pushoverFailures` is not
    // close, and the halves the trend check compares are 10.2% front against 7.8% back, the same
    // 2.3-point gap they had before the feature. Nothing was moved. **That a late case can double
    // on a feature nothing tuned it against is a Concern in the Task 10 report, not a defect this
    // comment can settle.**
    //
    // **And it is now the case a growth ceiling would bind on first.** `npm run sweep:maturation`
    // was re-run whole after `8e4a966` (4040s, four assertions passed) and this case tops the
    // season under every growth policy: 17.2% under `surplus`, 15.0% under `only anti`, **20.6% at
    // `best of all runs`** — the highest non-opening figure in the season on any policy. It breaks
    // nothing, because `balance.sweep.ts` measures `'never'` and that is where the band is
    // asserted. It also *widens* the no-trap margin rather than threatening it: `only anti` wins
    // 406 boards here and loses 111, and that **+295 is 84% of the antibody's whole season margin
    // of +351**. Free marks make a grown cell more worth having, not less. A future round that
    // wants a ceiling on grown runs should price it here and expect the rest of the season to have
    // slack.
    id: 'relapse', node: 'gut', region: 'GUT · CASE 12', title: 'Relapse', credits: 'staph', tier: 1,
    story: 'You had this in the spring. It never fully left, and what it makes goes after your own cells.',
    rules: [RELAPSING, TOXIC],
    startingEnergy: 400,
    waves: [
      [{ kind: 'staph', count: 15 }, { kind: 'toxin', count: 2 }],
      [{ kind: 'staph', count: 20 }, { kind: 'toxin', count: 3 }, { kind: 'film', count: 4 }],
      [{ kind: 'staph', count: 23 }, { kind: 'toxin', count: 4 }, { kind: 'spore', count: 6 }],
      [{ kind: 'staph', count: 26 }, { kind: 'toxin', count: 5 }, { kind: 'film', count: 5 }, { kind: 'mrsa', count: 2 }],
      [{ kind: 'staph', count: 27 }, { kind: 'toxin', count: 5 }, { kind: 'spore', count: 5 }, { kind: 'mrsa', count: 3 }],
    ],
    path: [[398, 84], [318, 78], [64, 66], [50, 250], [304, 262], [316, 366], [140, 372], [130, 286], [236, 292], [244, 214], [-24, 202]],
    spots: [[186, 146], [180, 34], [356, 318], [186, 410], [18, 116]],
    mounts: [[10, 148], [316, 322]],
  },
  {
    // The finale, and the one case in the season fought with no vaccine and no brief.
    //
    // Three things are new here and each is the last of its kind: the rule hides the wave table,
    // the strain ignores the mark, and the vessel runs **upward** — in off the floor, out through
    // the roof, the only case in the season whose flow is against the grain of every other. The
    // fiction and the mechanic are the same sentence: it is climbing toward the core.
    //
    // **The antibody does nothing here.** Strain Vesper is untaggable, so the cell that covers most
    // of the vessel on every other board contributes nothing to the half of the wave that matters,
    // and the case has to be won with the short-ranged cells. That is what the geometry is for: the
    // spots sit closer to the vessel than any other case in the season, because a board that has to
    // be fought at range 74 needs somewhere to stand.
    //
    // **Six measured passes, five of them spent on the strain rather than on this table.** It opened
    // at 0 of 7776 with Vesper at 90 health and 5 regeneration: an untaggable body that heals has no
    // counterplay except damage, so its health is not a linear dial — anything the board cannot
    // out-damage arrives whole however long it was under fire. 46 health and 2 regeneration is where
    // that stopped being a wall and started being a demand.
    //
    // The last pass was geometry and it moved more than every count did: two spots pulled in were
    // worth **3.6% to 11.1%**, and half that move back landed the case at 6.2%. Which is the season
    // shape review's finding again, in the one case where it is not a surprise — a board fought
    // without the longest-ranged cell in the dock is a board where the offsets decide everything.
    //
    // It credits staph, which the season has already finished. That is deliberate: by the time this
    // is played every vaccine the game can give is held, so the familiar half of each wave is as
    // easy as it will ever be and the unfamiliar half is untouched by any of them.
    //
    // **After the memory response: 6.2% → 7.0%**, re-measured after `8e4a966`, 482 → 547 of 7776,
    // +0.8 points off 10,965 arrivals and 2,194 killers.
    //
    // **This case is entered at 3/3/3, and it is one of the two measurements that says full memory
    // is not what breaks a case.** The season finishes every vaccine by day 10, so the board sweep
    // meets this case at exactly the profile `arrivals.sweep.ts` calls memory 3 — the arm that reads
    // 44.0% on the forearm and 45.8% on the throat — and it moves eight tenths of a point. The
    // paragraph above already says why, one sentence earlier than the feature existed: **the
    // antibody does nothing here.** Strain Vesper carries `noTag`, so an antibody arrival skips it
    // exactly as a placed one does, and a killer arrival may only touch what `isTagged` already
    // says is marked — so 2,194 free killers are 2,194 shots at the familiar half of the table and
    // none at all at the half that decides the case.
    //
    // Free help is worth what the wave table lets it touch, and that is content rather than a dial.
    // Nothing in `rules.ts` distinguishes this case from the forearm; the wave tables do.
    id: 'vesper', node: 'footR', region: 'FOOT · CASE 13', title: 'Strain Vesper', credits: 'staph', tier: 3,
    story: 'A scratch from the garden, four days ago. Nothing in the body has met this before, and nothing has been written about what is coming.',
    rules: [NOVEL],
    startingEnergy: 410,
    waves: [
      [{ kind: 'vesper', count: 2 }, { kind: 'staph', count: 7 }],
      [{ kind: 'vesper', count: 3 }, { kind: 'virus', count: 7 }, { kind: 'staph', count: 6 }],
      [{ kind: 'vesper', count: 4 }, { kind: 'spore', count: 5 }, { kind: 'film', count: 3 }],
      [{ kind: 'vesper', count: 4 }, { kind: 'virus', count: 9 }, { kind: 'mrsa', count: 2 }],
      [{ kind: 'vesper', count: 6 }, { kind: 'staph', count: 12 }, { kind: 'film', count: 4 }, { kind: 'mrsa', count: 3 }],
    ],
    path: [[214, 454], [206, 366], [96, 330], [78, 236], [166, 196], [180, 108], [292, 74], [300, -24]],
    spots: [[142, 396], [40, 296], [148, 262], [100, 154], [252, 148]],
    mounts: [[162, 400], [120, 206]],
  },
  {
    // The last stand, fought once, at the end. The map only ever opens this case by spreading
    // into it — `content/body.ts` marks the core, never a door — so the fiction and the mechanic
    // agree: nothing about a systemic infection arrives from one place, and neither does this one.
    //
    // **No door, so nowhere outside for the vessel to cross from.** It enters and leaves through
    // the same edge, looping through the middle. Same-edge is not itself new — the stomach runs
    // top→top and the blister bottom→bottom (`2026-07-31-season-shape-review.md` §5's table) —
    // but the *pair* is, and a pair no other case has is what §5 actually asks for: right→right
    // was one of the six still free.
    //
    // **Five spots by profile, against vesper** — the case this one most resembles in what it
    // asks: a novel, unmarkable strain that has to be fought at short range because the dock's
    // longest reach does nothing for half of what is coming. Grid-searched cell by cell across
    // all six defender ranges against vesper's own five-spot profile (season-shape review §5's
    // method), which is why the numbers below read close to that case's rather than to any other.
    //
    // **The novel rule, reused rather than invented an eighth time.** A strain that reached the
    // core is by definition one nothing before it stopped, so the brief hiding the wave table is
    // the truest thing it could do — see the comment on `NOVEL`.
    //
    // **Its clear rate is a property of the run that reaches it, and that is now measured rather
    // than deferred.** `tests/sweep/runSweep.ts` plays the whole board space at the day, immunity
    // and vaccines runs actually arrive at the core with — which is nothing, on every count: a run
    // gets here by *losing* ground, so the arrival this case is authored against is day 14 with
    // zero cases cleared and zero immunity, not the full dock and capped immunity the board sweep
    // enters every case at.
    //
    // **As authored it was the easiest case in the season, by a distance.** 38.4% of boards cleared
    // at the board sweep's entry and 21.0% at the arrival a run actually makes — against a season
    // running 5.2% to 14.0%, and a band whose ceiling is 15%. The cause was the same one the season
    // has found four times now: summed over its five spots a phagocyte covered **23.2 seconds** of
    // vessel here, the most generous board ever authored for this game, half again the 15 to 19
    // seconds the rest of the season sits at. Three measured passes:
    //
    // - **The five spots pushed 12 units off the vessel** — 23.2s of coverage down to 19.6s — was
    //   worth 21.0% to 14.6% at the arrival entry.
    // - **Pushing further stopped working, and that is specific to this case.** 16 units (17.5s)
    //   measured 16.4% and 20 units (14.6s) measured 13.7% — non-monotone, because this table sends
    //   toxins and `applyToxinStun` is not gated on the case rule: a spot far enough out to cover
    //   less vessel is also far enough out to stop being stunned. Geometry saturates here around
    //   14%, which is why it could not do the job alone.
    // - **Vesper is the dial that finished it.** Untaggable and regenerating, so it is the half of
    //   every wave the board cannot answer cheaply: 2/3/3/4/5 up to 3/4/5/6/8 was worth 14.6% to
    //   **9.8%**, roughly a point per body — three times what a staph is worth on any other case.
    //   The late-wave mass on top of it (waves 3 to 5, nowhere earlier, for the reason the
    //   bronchitis case records) took it to **5.3%**, at the arrival entry, which is the band floor.
    //
    // At the board sweep's own entry it now clears **13.0%**, inside the band — so the ceiling
    // exemption `band.ts` carried for this case, and named this measurement as the thing that would
    // settle it, is retired.
    //
    // **5.3% is the bottom of a range, not a point, and the range is what to tune against.**
    // `runSweep.ts` enumerates this board space at the extremes of the arrivals runs make, and
    // measured over 200 seeds those extremes are:
    //
    //     day  14   0 cleared  immunity 0/0/0   415/7776 =  5.3%
    //     day  16   1 cleared  immunity 0/1/0   415/7776 =  5.3%
    //     day  39   1 cleared  immunity 3/0/0   415/7776 =  5.3%
    //     day 166   6 cleared  immunity 3/3/3  1013/7776 = 13.0%
    //
    // **The range is 5.3% to 13.0%, and what moves it is holding all three strains at once.** Three
    // points of staph alone is worth nothing — 3/0/0 reads the same 5.3% as an empty profile —
    // because this table sends staph, virus, film, spore, toxin and vesper together and a single
    // vaccine answers one column of it. The top of the range is the board sweep's own entry, which
    // is what a run that has already nearly won arrives with.
    //
    // An earlier pass recorded "5.3%, stable across arrivals". That was four head-of-list contexts
    // that all happened to carry two points of immunity or fewer, and it was wrong. `runSweep.ts`
    // now picks the ends of the range on purpose rather than the front of a map.
    //
    // **What a real run arrives with is the bottom of that range**: median day 14 to 16 with zero
    // or one case cleared, on both case policies. The 13.0% end is reachable and rare.
    //
    // **The run-level target this case owes, and currently misses.** The other three pacing numbers
    // each had a target stated before they were measured; this one was anchored to the *board*
    // band's floor and its run-level consequence found afterwards. Measured at the shipped pacing
    // numbers, 200 seeds: the last stand is fought in **34 to 41 per cent** of runs and **won in 0
    // to 2 per cent** — so reaching the core is, in practice, how a run ends, and `holdCore`'s whole
    // reprieve-and-second-siege rule fires about once in a hundred runs. Lowering
    // `OUTBREAK_INTERVAL` made the core easier to reach and did nothing for the share won, which is
    // what says this is the case's number rather than the front line's. A defensible target is
    // **a last stand won by a quarter of the runs that fight it**, which is what would make the
    // reprieve a thing players see rather than a branch that only exists in code. Meeting it means
    // this case sitting well above the board band's
    // floor at the arrival entry, which is a content decision the next pass owns. It is written
    // here rather than left in a report so that pass starts from a number.
    //
    // **After the memory response: 13.0% → 13.6%** at this harness's entry, re-measured after
    // `8e4a966`, 1013 → 1056 of 7776, +0.6 points off 17,809 arrivals and 3,730 killers — the
    // season's second largest delivery of free help and two boards a thousand arrivals out of it,
    // against blister's twenty-seven. Only measles converts less. The reason is vesper's: a fifth to
    // a quarter of every wave here is Vesper by count, Vesper cannot be marked, and a killer arrival
    // may only touch what is already marked. Still inside the band, so the exemption this case's
    // own paragraph retired stays retired.
    //
    // **The range above is a flag-off range, and re-taking it is Task 11's.** `runSweep.ts` has not
    // been re-run since arrivals were turned on, so every figure in the four-row table above and
    // the run-level target under it are pre-feature numbers. Two of the four rows can be reasoned
    // to without re-running it, and it is worth writing which:
    //
    // - **The 5.3% floor cannot have moved.** Day 14, nothing cleared, immunity 0/0/0 — with no
    //   memory `noteRecognition` banks nothing and no call is ever rolled, exactly as on the
    //   forearm. The same holds for the day-16 and day-39 rows: one strain at any depth is still
    //   nothing for the strains this table sends alongside it.
    // - **The 13.0% top is now 13.6%**, and that is measured rather than inferred. That row is day
    //   166, six cleared, immunity 3/3/3 — and `day` reaches the simulation only through
    //   `unlockedKinds`, which has offered all six cells since day 8, so day 166 at 3/3/3 and this
    //   harness's own day-11 entry at 3/3/3 are the identical board space. It is the same 1056/7776.
    //
    // So the range is **5.3% to 13.6%** and it widened at the top by six tenths of a point. What
    // that does to "a last stand won by a quarter of the runs that fight it" is a whole-run question
    // and needs the whole-run instrument.
    //
    // **The whole-run instrument has now been run, and it moved the arrivals rather than the case.**
    // `npm run sweep:runs`, 200 seeds, arrivals on. The four extremes of the 49 distinct arrivals
    // it saw, against the four rows above:
    //
    //     day  14   0 cleared  immunity 0/0/0   415/7776 =  5.3%
    //     day  62   5 cleared  immunity 3/3/2   534/7776 =  6.9%
    //     day  12   1 cleared  immunity 0/1/0   411/7776 =  5.3%
    //     day  15   1 cleared  immunity 1/0/0   423/7776 =  5.4%
    //
    // **The floor held exactly and the top of the range fell from 13.0% to 6.9% — because no run
    // arrives at 3/3/3 any more, not because the case got harder.** The 13.0% row was day 166, and
    // arrivals took 24 days off the median `nearestToCore` run and 15 off `cheapest`: runs resolve
    // sooner, so the very long run that had held nearly everything before reaching the core is no
    // longer in the sample at all. The board space at 3/3/3 is still 13.6%, unchanged and measured
    // above — what changed is that a run no longer gets there. A future round that lengthens runs
    // will see the top of this range come back up without this case being touched.
    //
    // Two smaller readings in that table are the feature showing through rather than noise. At
    // 0/1/0 this case now clears **411** boards where an empty profile clears 415: one point of film
    // is enough to bank recognition and roll a call, and against a table this size the four boards
    // it costs are worth more than the help is. At 1/0/0 it clears 423, eight boards the other way.
    // Both are inside a handful of boards and neither is a lever; they are recorded because "one
    // strain at any depth is nothing here" was the reasoning above and it is now measurably not
    // quite nothing.
    //
    // **The run-level target is unchanged, and still missed by the same distance.** At 200 seeds
    // with arrivals on the last stand is fought in **33 to 41 per cent** of runs and won in **0 to 2
    // per cent** — the same 34-to-41 and 0-to-2 recorded above. So the memory response did not touch
    // this case's run-level shape at all, and "a last stand won by a quarter of the runs that fight
    // it" is still a content decision nobody has taken. The reason it is untouched is the one this
    // case's own paragraph gives: a fifth to a quarter of every wave here is Vesper, Vesper cannot be
    // marked, and a killer may only touch what is marked.
    id: 'heart', node: 'heart', region: 'HEART · CASE 14', title: 'The last stand',
    credits: 'staph', tier: 3,
    story: 'Every road to the core has fallen. Whatever is arriving here already got past everything else, all of it, at once.',
    rules: [NOVEL],
    startingEnergy: 410,
    waves: [
      [{ kind: 'staph', count: 8 }, { kind: 'vesper', count: 3 }],
      [{ kind: 'staph', count: 9 }, { kind: 'virus', count: 6 }, { kind: 'vesper', count: 4 }],
      [
        { kind: 'staph', count: 11 }, { kind: 'toxin', count: 6 }, { kind: 'film', count: 4 },
        { kind: 'vesper', count: 5 },
      ],
      [
        { kind: 'staph', count: 14 }, { kind: 'mrsa', count: 3 }, { kind: 'spore', count: 7 },
        { kind: 'vesper', count: 6 },
      ],
      [
        { kind: 'staph', count: 17 }, { kind: 'virus', count: 11 }, { kind: 'mrsa', count: 4 },
        { kind: 'vesper', count: 8 },
      ],
    ],
    path: [
      [398, 130], [268, 110], [178, 148], [104, 224], [150, 320], [252, 336],
      [298, 240], [206, 196], [140, 260], [206, 356], [320, 366], [398, 300],
    ],
    // The five spots the profile search landed on, each moved 12 units directly away from the
    // nearest point of the vessel. The profile is kept — the spread from spot 2's long look at the
    // coil down to spot 4's glance is the same shape it was authored with — and every one of the
    // five still holds all six cells for over a second, so nothing here became a reach demand. What
    // changed is only how much vessel the board sees at once.
    spots: [[279, 207], [95, 144], [302, 180], [351, 258], [73, 319]],
    mounts: [[331, 314], [119, 192]],
  },
];

export const CASE_BY_ID: Readonly<Record<CaseId, CaseDefinition>> = Object.fromEntries(
  CASES.map((c) => [c.id, c]),
) as Record<CaseId, CaseDefinition>;

/**
 * What the chrome calls this case: every rule it is played under, joined.
 *
 * One function rather than three call sites reading `rules[0].label`, because a compound case that
 * announced one of its two rules on the board and both of them on the brief would be the screen
 * hiding a rule the player is being charged for.
 */
export function ruleLabels(definition: CaseDefinition): string {
  return definition.rules.map((rule) => rule.label).join(' · ');
}

/** Whether a case is played under a given rule. The content-side twin of `hasRule`. */
export function caseHasRule(definition: CaseDefinition, kind: CaseRuleKind): boolean {
  return definition.rules.some((rule) => rule.kind === kind);
}
