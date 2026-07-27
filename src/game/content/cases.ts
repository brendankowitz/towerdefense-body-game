import type { CaseId, CaseRuleKind, BodyNodeId, PathogenKind, Point, StrainId } from '../types';

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
    id: 'forearm', node: 'forearm', region: 'FOREARM · CASE 04', title: 'Deep cut', rule: 'wound', credits: 'staph',
    story: 'Kitchen knife, two hours ago. The skin is open and bacteria are walking straight in.',
    ruleLabel: 'Bleeding', ruleSub: 'You lose energy every second until a clot is placed',
    startingEnergy: 260,
    waves: [
      [{ kind: 'staph', count: 8 }],
      [{ kind: 'staph', count: 13 }],
      [{ kind: 'staph', count: 12 }, { kind: 'film', count: 3 }],
      [{ kind: 'staph', count: 15 }, { kind: 'film', count: 4 }, { kind: 'mrsa', count: 1 }],
      [{ kind: 'staph', count: 18 }, { kind: 'film', count: 5 }, { kind: 'mrsa', count: 3 }],
    ],
    path: [[-24, 46], [86, 58], [150, 116], [232, 146], [252, 238], [168, 298], [112, 342], [104, 430]],
    // Spot 4 was at [206, 372]: 81.7 from the vessel, where the only cell that covered a whole
    // second of it was the antibody. Pulled 20 left, it is still the case's longest reach and now
    // every cell can do something from it. See `content.invariants.test.ts`, build spots.
    spots: [[70, 118], [206, 88], [292, 196], [69, 282], [186, 372]],
  },
  {
    id: 'throat', node: 'throat', region: 'THROAT · CASE 05', title: 'Flu', rule: 'virus', credits: 'virus',
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
    id: 'stomach', node: 'stomach', region: 'STOMACH · CASE 06', title: 'Food poisoning', rule: 'poison', credits: 'film',
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
    // Credits film, not staph, and the reason is a promise the brief would otherwise break. The
    // brief shows the held copy of whichever strain a case credits, and Tetanus's is "the first
    // Staph of every wave bounces off" — but `applySpawn` only bounces one in a `wound` case. A
    // non-wound case crediting staph therefore tells a player with the vaccine that something will
    // happen which will not. Biofilm's serum drops armour wherever it is met, so its copy is true
    // here, and a splinter site is where a biofilm belongs anyway. See the note to the team lead:
    // the gate and the copy disagree, and one of them is wrong.
    id: 'hand', node: 'handR', region: 'HAND · CASE 07', title: 'Splinter', rule: 'dormant', credits: 'film',
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
    // roughly three to four tenths of a percentage point and the whole target window is half a
    // point wide, so counts alone cannot land a case. Ten energy is worth about a tenth, which is
    // what the odd-looking 355 is doing: it is the last 0.8 points, bought back after wave 5 got
    // the staph that makes this table escalate the way a wave table should read.
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
];

export const CASE_BY_ID: Readonly<Record<CaseId, CaseDefinition>> = Object.fromEntries(
  CASES.map((c) => [c.id, c]),
) as Record<CaseId, CaseDefinition>;
