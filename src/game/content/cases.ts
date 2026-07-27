import { INFLAMMATION_PER_PIP } from './rules';
import { STRAIN_NAME } from './vaccines';
import type { CaseId, CaseRuleKind, BodyNodeId, PathogenKind, Point, StrainId, Tier } from '../types';

export interface WaveEntry {
  readonly kind: PathogenKind;
  readonly count: number;
}

export interface CaseDefinition {
  readonly id: CaseId;
  readonly node: BodyNodeId;
  readonly region: string;
  readonly title: string;
  readonly rule: CaseRuleKind;
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
  readonly ruleLabel: string;
  readonly ruleSub: string;
  readonly story: string;
  readonly startingEnergy: number;
  readonly waves: readonly (readonly WaveEntry[])[];
  readonly path: readonly Point[];
  readonly spots: readonly Point[];
}

export const CASES: readonly CaseDefinition[] = [
  {
    id: 'forearm', node: 'forearm', region: 'FOREARM · CASE 04', title: 'Deep cut', rule: 'wound', credits: 'staph', tier: 1,
    story: 'Kitchen knife, two hours ago. The skin is open and bacteria are walking straight in.',
    ruleLabel: 'Bleeding', ruleSub: 'You lose energy every second until a clot is placed',
    // Opened at 9.1% of affordable boards clearing, which made the first case of the game the one
    // nine players in ten lose. A season's opening case is the forgiving one — everything after it
    // is measured against it — so this was retuned to 13.2%, inside the band's 15% ceiling with
    // room to spare. Two levers, and they are not interchangeable:
    //
    // **Starting energy, 260 to 320.** Worth +1.4 points here, against the tenth of a point ten
    // energy buys on the hand case: this case bleeds and starts poorest, so energy it has not got
    // is a board it never builds. It is also the lever that saturates — 320 to 400 bought only
    // another 1.0 — and leaning on it further would have paid for the opening by making the bleed
    // stop mattering, which is the one thing this case is about.
    //
    // **Wave 5, 18/5/3 to 17/5/2.** Worth the remaining +2.7. Wave 5 is where two thirds of the
    // boards die, so mass removed there is worth several times the same mass removed from wave 1 —
    // the same finding the hand case records below. Wave 5 keeps more staph than wave 4 on purpose:
    // dropping it to 15 measured 14.5%, too close to the ceiling, and it also flattened the table
    // into two waves that read the same.
    //
    // What this bought the player is in the histogram: boards losing on wave 1 fell from 729 to
    // 453. What it bought the season is headroom — see `tests/sweep/curve.ts`.
    startingEnergy: 320,
    waves: [
      [{ kind: 'staph', count: 8 }],
      [{ kind: 'staph', count: 13 }],
      [{ kind: 'staph', count: 12 }, { kind: 'film', count: 3 }],
      [{ kind: 'staph', count: 15 }, { kind: 'film', count: 4 }, { kind: 'mrsa', count: 1 }],
      [{ kind: 'staph', count: 17 }, { kind: 'film', count: 5 }, { kind: 'mrsa', count: 2 }],
    ],
    path: [[-24, 46], [86, 58], [150, 116], [232, 146], [252, 238], [168, 298], [112, 342], [104, 430]],
    // Spot 4 was at [206, 372]: 81.7 from the vessel, where the only cell that covered a whole
    // second of it was the antibody. Pulled 20 left, it is still the case's longest reach and now
    // every cell can do something from it. See `content.invariants.test.ts`, build spots.
    spots: [[70, 118], [206, 88], [292, 196], [69, 282], [186, 372]],
  },
  {
    id: 'throat', node: 'throat', region: 'THROAT · CASE 05', title: 'Flu', rule: 'virus', credits: 'virus', tier: 1,
    story: 'Someone coughed on the train. The virus is already copying itself in your throat.',
    ruleLabel: 'Multiplying', ruleSub: 'Every virus that dies splits into two smaller ones',
    startingEnergy: 300,
    waves: [
      [{ kind: 'virus', count: 6 }],
      [{ kind: 'virus', count: 9 }, { kind: 'spore', count: 2 }],
      [{ kind: 'virus', count: 11 }, { kind: 'spore', count: 4 }],
      [{ kind: 'virus', count: 13 }, { kind: 'spore', count: 5 }, { kind: 'film', count: 3 }],
      [{ kind: 'virus', count: 16 }, { kind: 'spore', count: 6 }, { kind: 'mrsa', count: 2 }],
    ],
    path: [[-24, 120], [90, 120], [150, 60], [240, 74], [268, 170], [180, 230], [180, 320], [96, 380], [104, 430]],
    spots: [[64, 62], [220, 148], [107, 218], [258, 286], [232, 372]],
  },
  {
    id: 'stomach', node: 'stomach', region: 'STOMACH · CASE 06', title: 'Food poisoning', rule: 'poison', credits: 'film', tier: 1,
    story: 'The shellfish. Toxins are going after your own cells instead of the tissue.',
    ruleLabel: 'Toxic', ruleSub: 'Pathogens damage your defenders. Antibodies survive toxins far better than phagocytes',
    startingEnergy: 320,
    waves: [
      [{ kind: 'staph', count: 10 }, { kind: 'toxin', count: 2 }],
      [{ kind: 'staph', count: 9 }, { kind: 'toxin', count: 4 }, { kind: 'film', count: 3 }],
      [{ kind: 'staph', count: 13 }, { kind: 'toxin', count: 5 }, { kind: 'spore', count: 3 }],
      [{ kind: 'staph', count: 15 }, { kind: 'toxin', count: 6 }, { kind: 'film', count: 5 }],
      [{ kind: 'staph', count: 18 }, { kind: 'toxin', count: 8 }, { kind: 'film', count: 6 }, { kind: 'mrsa', count: 2 }],
    ],
    path: [[-24, 70], [100, 90], [180, 62], [268, 120], [230, 214], [120, 250], [90, 330], [180, 392], [180, 430]],
    // Spot 0 was at [74, 168]: 81.1 from the vessel, antibody-only for the same reason forearm's
    // spot 4 was. Ten units up is enough — it stays the case's longest reach and stops being a
    // parking space.
    spots: [[70, 158], [212, 132], [292, 216], [46, 264], [234, 341]],
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
    id: 'hand', node: 'handR', region: 'HAND · CASE 07', title: 'Splinter', rule: 'dormant', credits: 'film', tier: 1,
    story: 'You pulled the splinter out last week. Something came in with it and stayed.',
    ruleLabel: 'Relapsing', ruleSub: 'Some of what you kill goes down instead of away, and gets back up where it fell',
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
    startingEnergy: 355,
    waves: [
      [{ kind: 'staph', count: 10 }, { kind: 'spore', count: 3 }],
      [{ kind: 'staph', count: 13 }, { kind: 'spore', count: 4 }, { kind: 'film', count: 3 }],
      [{ kind: 'staph', count: 14 }, { kind: 'spore', count: 5 }, { kind: 'film', count: 4 }],
      [{ kind: 'staph', count: 18 }, { kind: 'spore', count: 6 }, { kind: 'film', count: 5 }, { kind: 'mrsa', count: 2 }],
      [{ kind: 'staph', count: 19 }, { kind: 'spore', count: 8 }, { kind: 'film', count: 6 }, { kind: 'mrsa', count: 3 }],
    ],
    // A splinter track: in at the wrist, folded back on itself twice, out through the palm. No
    // spot here is one of the antibody-only parking spaces the first three cases each had to have
    // pulled in — the closest is 73.4 against the phagocyte's 74, so the cheapest cell in the dock
    // can fight from four of the five and the fifth is a real reach demand rather than a wall.
    path: [[-24, 74], [96, 88], [188, 52], [268, 118], [214, 200], [104, 232], [140, 330], [214, 386], [214, 430]],
    spots: [[76, 158], [196, 132], [300, 190], [52, 296], [186, 292]],
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
    id: 'blister', node: 'footL', region: 'FOOT · CASE 08', title: 'Blister', rule: 'wound', credits: 'film', tier: 1,
    story: 'New boots, eleven kilometres. The skin rubbed through this morning and it has not closed.',
    ruleLabel: 'Bleeding', ruleSub: 'You lose energy every second until a clot is placed',
    startingEnergy: 262,
    waves: [
      [{ kind: 'staph', count: 11 }, { kind: 'film', count: 2 }],
      [{ kind: 'staph', count: 14 }, { kind: 'film', count: 3 }],
      [{ kind: 'staph', count: 15 }, { kind: 'film', count: 4 }, { kind: 'spore', count: 3 }],
      [{ kind: 'staph', count: 18 }, { kind: 'film', count: 6 }, { kind: 'spore', count: 4 }, { kind: 'mrsa', count: 1 }],
      [{ kind: 'staph', count: 23 }, { kind: 'film', count: 7 }, { kind: 'spore', count: 5 }, { kind: 'mrsa', count: 3 }],
    ],
    path: [[-24, 58], [78, 44], [162, 74], [228, 40], [286, 106], [230, 168], [128, 168], [72, 240], [140, 306], [236, 322], [252, 398], [176, 430]],
    spots: [[44, 122], [252, 44], [182, 242], [58, 320], [310, 348]],
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
    id: 'measles', node: 'lungR', region: 'RIGHT LUNG · CASE 09', title: 'Measles', rule: 'amnesia',
    credits: 'virus', tier: 2, wipes: 'film',
    story: 'The rash has already faded. What is in the lung now is everything your body used to know how to stop.',
    ruleLabel: 'Amnesia',
    ruleSub: `Your ${STRAIN_NAME.film} immunity is wiped for this case — armour holds, and the profile keeps it`,
    startingEnergy: 305,
    waves: [
      [{ kind: 'virus', count: 6 }, { kind: 'staph', count: 3 }],
      [{ kind: 'virus', count: 11 }, { kind: 'film', count: 3 }, { kind: 'staph', count: 5 }],
      [{ kind: 'virus', count: 11 }, { kind: 'film', count: 4 }, { kind: 'spore', count: 3 }],
      [{ kind: 'virus', count: 12 }, { kind: 'film', count: 6 }, { kind: 'spore', count: 4 }, { kind: 'mrsa', count: 1 }],
      [{ kind: 'virus', count: 15 }, { kind: 'film', count: 5 }, { kind: 'spore', count: 5 }, { kind: 'mrsa', count: 2 }],
    ],
    path: [[-24, 96], [88, 76], [176, 118], [252, 82], [300, 152], [236, 226], [148, 244], [96, 316], [168, 380], [168, 430]],
    spots: [[62, 134], [218, 110], [302, 262], [122, 188], [216, 336]],
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
    id: 'sinus', node: 'sinus', region: 'SINUS · CASE 10', title: 'Hay fever', rule: 'allergy', credits: 'staph', tier: 1,
    story: 'Grass season. None of what is drifting through here can hurt you, and your body has not been told.',
    ruleLabel: 'Overreaction',
    ruleSub: `The pollen is harmless. Every ${String(INFLAMMATION_PER_PIP)} things you kill inflames the tissue and costs a pip`,
    startingEnergy: 300,
    waves: [
      [{ kind: 'pollen', count: 26 }, { kind: 'staph', count: 1 }],
      [{ kind: 'pollen', count: 36 }, { kind: 'staph', count: 2 }],
      [{ kind: 'pollen', count: 44 }, { kind: 'staph', count: 2 }],
      [{ kind: 'pollen', count: 50 }, { kind: 'staph', count: 2 }],
      [{ kind: 'pollen', count: 58 }, { kind: 'staph', count: 3 }],
    ],
    path: [[-24, 150], [64, 96], [150, 62], [244, 78], [300, 146], [268, 236], [176, 268], [96, 240], [76, 322], [160, 372], [252, 396], [252, 430]],
    spots: [[104, 152], [50, 200], [212, 182], [318, 274], [130, 400]],
  },
];

export const CASE_BY_ID: Readonly<Record<CaseId, CaseDefinition>> = Object.fromEntries(
  CASES.map((c) => [c.id, c]),
) as Record<CaseId, CaseDefinition>;
