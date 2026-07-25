import type { StrainId, Tier } from '../types';

export interface VaccineDefinition {
  readonly name: string;
  readonly tier: Tier;
  readonly effect: string;
  /** Earned by clearing this strain three times. Never purchasable. */
  readonly strain?: StrainId;
  /** Becomes available once this many cases are cleared. */
  readonly gate?: number;
  readonly cost?: string;
}

export const VACCINES: readonly VaccineDefinition[] = [
  { name: 'Tetanus', strain: 'staph', tier: 1, effect: 'First Staph of every wave bounces off' },
  { name: 'Flu B', strain: 'virus', tier: 1, effect: 'Flu no longer splits when it dies' },
  { name: 'Biofilm serum', strain: 'film', tier: 1, effect: 'Armour drops — phagocytes bite properly' },
  { name: 'Measles, mumps, rubella', gate: 2, tier: 2, effect: 'Blocks the immune-amnesia wipe entirely', cost: 'Costs a day you don’t fight' },
  { name: 'Chickenpox', gate: 99, tier: 2, effect: 'Stops a cleared case reopening later', cost: 'Survive a dormancy case first' },
  { name: 'Strain Vesper', tier: 3, effect: 'No vaccine exists yet — this one you fight raw' },
];

/**
 * Immunity screen rows and the brief's shield copy. Prototype lines 1003–1006, 1027–1029.
 * heldCopy is what the brief shows once the strain's vaccine is earned.
 */
export const STRAIN_ROWS: readonly {
  readonly key: StrainId; readonly name: string; readonly effect: string; readonly heldCopy: string;
}[] = [
  { key: 'staph', name: 'Tetanus', effect: 'The first Staph of every wave bounces off', heldCopy: 'Tetanus vaccine held. The first Staph of every wave bounces off.' },
  { key: 'virus', name: 'Flu B', effect: 'Flu can no longer split when it dies', heldCopy: 'Flu B vaccine held. Nothing splits when it dies.' },
  { key: 'film', name: 'Biofilm', effect: 'Armour drops — phagocytes hurt it properly', heldCopy: 'Biofilm serum held. Armour is gone — phagocytes bite properly.' },
];
