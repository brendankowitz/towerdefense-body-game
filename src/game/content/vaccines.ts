import type { StrainId, Tier } from '../types';

export interface VaccineDefinition {
  readonly name: string;
  readonly tier: Tier;
  readonly effect: string;
  /** Earned by clearing this strain three times. Never purchasable. */
  readonly strain?: StrainId;
  /**
   * Becomes available once this many cases are cleared. Must be reachable — the most a player
   * can ever clear is `CASE_REGIONS.length`, not `CASES.length`, because the last stand is
   * defended rather than held and `clearCase` keeps it out of `cleared`. A gate nobody can
   * satisfy is a row marked LOCKED forever, which is the same broken promise as a vaccine no
   * case credits; `content.invariants.test.ts` holds every gate at or under the real ceiling.
   */
  readonly gate?: number;
}

export const VACCINES: readonly VaccineDefinition[] = [
  // "In a wound" is the whole of the fix described above `STRAIN_ROWS`. Do not shorten it back.
  { name: 'Tetanus', strain: 'staph', tier: 1, effect: 'In a wound, the first Staph of every wave bounces off' },
  { name: 'Flu B', strain: 'virus', tier: 1, effect: 'Flu no longer splits when it dies' },
  { name: 'Biofilm serum', strain: 'film', tier: 1, effect: 'Armour drops — phagocytes bite properly' },
  { name: 'Measles, mumps, rubella', gate: 2, tier: 2, effect: 'Blocks the immune-amnesia wipe entirely' },
  // Earned like MMR, not deferred like Strain Vesper: `wallsCannotFall` in `front.ts` is the rule
  // this row promises, so there is a gate to reach rather than a build still to finish. Gated
  // later than MMR on purpose — the header's "earned, never bought" reads differently for a row
  // that a short run may never live to see than for one two clears away.
  { name: 'Chickenpox', gate: 8, tier: 2, effect: 'Stops a cleared case reopening' },
  { name: 'Strain Vesper', tier: 3, effect: 'No vaccine exists yet — this one you fight raw' },
];

/**
 * Immunity screen rows and the brief's shield copy. Prototype lines 1003–1006, 1027–1029.
 * heldCopy is what the brief shows once the strain's vaccine is earned.
 *
 * **Tetanus says "in a wound" because the shield only works in one.** `applySpawn` bounces a staph
 * only where `rule === 'wound'`, and the brief shows the held copy of whichever strain a case
 * credits — so the moment any non-wound case credits staph, an unconditional promise here tells a
 * vaccinated player about something that will not happen on the board they are about to play. That
 * came within one authoring decision of shipping: the hand case was moved off staph and onto film
 * to dodge it.
 *
 * The gate is the part that is right. Tetanus is a wound infection; a shield against it working in
 * a throat is the strange half of the disagreement, not the caveat. So the code kept its condition
 * and the copy grew one, which is also what lets a later case credit staph without lying.
 *
 * `vaccines.copy.test.ts` proves the condition is real by simulation and then holds every line here
 * to naming it — a conditional effect described in unconditional copy is the defect, and it is a
 * copy edit away from coming back.
 */
export const STRAIN_ROWS: readonly {
  readonly key: StrainId; readonly name: string; readonly effect: string; readonly heldCopy: string;
}[] = [
  { key: 'staph', name: 'Tetanus', effect: 'In a wound, the first Staph of every wave bounces off', heldCopy: 'Tetanus vaccine held. In a wound, the first Staph of every wave bounces off.' },
  { key: 'virus', name: 'Flu B', effect: 'Flu can no longer split when it dies', heldCopy: 'Flu B vaccine held. Nothing splits when it dies.' },
  { key: 'film', name: 'Biofilm', effect: 'Armour drops — phagocytes hurt it properly', heldCopy: 'Biofilm serum held. Armour is gone — phagocytes bite properly.' },
];

/**
 * What each strain's immunity is called, for copy that has to name one.
 *
 * The amnesia case's rule line says which immunity it takes away, and it takes it away by naming a
 * `StrainId`. Reading the name off the same field the simulation masks is what stops that line
 * going stale the day the wipe moves to another strain — the exact defect the Tetanus caveat above
 * exists to record.
 */
export const STRAIN_NAME: Readonly<Record<StrainId, string>> = Object.fromEntries(
  STRAIN_ROWS.map((row) => [row.key, row.name]),
) as Record<StrainId, string>;
