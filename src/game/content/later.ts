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

// Measles used to sit here. It is a case now, on the right lung, so the promise is kept rather
// than repeated: a row here and a case with the same name would put the illness on the timeline
// twice, once as something to play and once as something still coming.
export const LATER: readonly LaterEntry[] = [
  { offset: 7, name: 'Strain Vesper', region: 'Left lung', tier: 3, note: 'Novel — nothing known about it yet' },
];
