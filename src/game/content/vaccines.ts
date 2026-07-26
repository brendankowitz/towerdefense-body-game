import type { StrainId, Tier } from '../types';

export interface VaccineDefinition {
  readonly name: string;
  readonly tier: Tier;
  readonly effect: string;
  /** Earned by clearing this strain three times. Never purchasable. */
  readonly strain?: StrainId;
  /**
   * Becomes available once this many cases are cleared. Must be reachable — `CASES.length` is
   * the most a player can ever clear, and `content.invariants.test.ts` holds every gate at or
   * under it. A gate nobody can satisfy is a row marked LOCKED forever, which is the same broken
   * promise as a vaccine no case credits.
   */
  readonly gate?: number;
  /**
   * On the schedule, but the rule that would give it meaning has not been built. Renders as its
   * own status, so the row reads as a promise about the season rather than as something the
   * player is failing to unlock. Never combined with `strain` or `gate` — those describe things
   * that can be earned now.
   */
  readonly later?: true;
  readonly cost?: string;
}

export const VACCINES: readonly VaccineDefinition[] = [
  { name: 'Tetanus', strain: 'staph', tier: 1, effect: 'First Staph of every wave bounces off' },
  { name: 'Flu B', strain: 'virus', tier: 1, effect: 'Flu no longer splits when it dies' },
  { name: 'Biofilm serum', strain: 'film', tier: 1, effect: 'Armour drops — phagocytes bite properly' },
  { name: 'Measles, mumps, rubella', gate: 2, tier: 2, effect: 'Blocks the immune-amnesia wipe entirely', cost: 'Costs a day you don’t fight' },
  // Shipped with `gate: 99` against a maximum of three clears: permanently LOCKED, quoting a case
  // type that does not exist. It is on the schedule, not behind a gate, and now says so.
  { name: 'Chickenpox', later: true, tier: 2, effect: 'Stops a cleared case reopening later' },
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
