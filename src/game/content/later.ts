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

// Measles, then Strain Vesper, then Chickenpox: three promises that used to sit here as rows the
// season could not yet keep, each retired the same way — the mechanic the row warned about got
// built, and a row left behind would tell the player about a promise already kept. Measles and
// Vesper became cases (the right lung and the right foot); Chickenpox became `wallsCannotFall` in
// `front.ts`, which is why the row that used to say "a region that reopens is still to come" is
// gone rather than reworded — the reopening it warned about is now the one thing that vaccine
// stops.
//
// Empty because the season has nothing left it has promised and cannot do, not because the
// mechanism is retired: the next thing that ships ahead of its content goes back in here the same
// way the three before it did.
export const LATER: readonly LaterEntry[] = [];
