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

// Measles used to sit here, then Strain Vesper. Both are cases now — the right lung and the right
// foot — so the promises are kept rather than repeated: a row here and a case with the same name
// would put the illness on the timeline twice, once as something to play and once as something
// still coming.
//
// What is left is the one thing the game still promises and cannot yet do. `vaccines.ts` ships
// Chickenpox as `later: true`, whose effect is "stops a cleared case reopening later" — so the
// screen already tells the player a held region can come back, and no rule in `hazards.ts` can
// reopen one. This row is that promise on the timeline, where the player meets it first. It goes
// when the rule lands, the way the two before it did.
export const LATER: readonly LaterEntry[] = [
  { offset: 1, name: 'Something you already cleared', region: 'A region you are holding', tier: 2, note: 'Not yet — a region that reopens is still to come' },
];
