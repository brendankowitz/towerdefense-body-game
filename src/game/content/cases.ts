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
  },
  {
    id: 'throat', node: 'throat', region: 'THROAT · CASE 05', title: 'Flu', credits: 'virus', tier: 1,
    story: 'Someone coughed on the train. The virus is already copying itself in your throat.',
    rules: [{ kind: 'virus', label: 'Multiplying', sub: 'Every virus that dies splits into two smaller ones' }],
    // Day 2 opens the killer cell, so this is the first case that can answer a Resistant — and the
    // first that sends one, in its last wave. Starting energy carries the rest: at four cells the
    // board is a third smaller than it used to be, and the wave that kills three boards in four is
    // the first one.
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
  },
  {
    id: 'stomach', node: 'stomach', region: 'STOMACH · CASE 06', title: 'Food poisoning', credits: 'film', tier: 1,
    story: 'The shellfish. Toxins are going after your own cells instead of the tissue.',
    rules: [TOXIC],
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
