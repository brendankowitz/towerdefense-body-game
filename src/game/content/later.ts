import type { Tier } from '../types';

// Naming policy — tier 1: everyday, freely named. tier 2: named only because the mechanic is the
// real mechanic. tier 3: invented strains, never a real outbreak. No bioterror framing anywhere.
export interface LaterEntry {
  readonly offset: number;
  readonly name: string;
  readonly region: string;
  readonly tier: Tier;
  readonly note: string;
}

export const LATER: readonly LaterEntry[] = [
  { offset: 4, name: 'Measles', region: 'Whole body', tier: 2, note: 'Wipes one immunity you already earned' },
  { offset: 7, name: 'Strain Vesper', region: 'Lungs', tier: 3, note: 'Novel — nothing known about it yet' },
];
