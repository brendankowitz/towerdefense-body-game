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
];

export const CASE_BY_ID: Readonly<Record<CaseId, CaseDefinition>> = Object.fromEntries(
  CASES.map((c) => [c.id, c]),
) as Record<CaseId, CaseDefinition>;
