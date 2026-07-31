import type { PaletteToken, PathogenKind } from '../types';

export interface PathogenStats {
  readonly kind: PathogenKind;
  readonly name: string;
  readonly note: string;
  readonly hp: number;
  readonly speed: number;
  readonly reward: number;
  readonly radius: number;
  readonly shape: 'circle' | 'square' | 'diamond';
  readonly token: PaletteToken;
  readonly armour?: number;
  readonly splits?: true;
  readonly regen?: number;
  readonly stun?: number;
  readonly noTag?: true;
  /**
   * Tissue pips this costs the player when it reaches the end of the vessel. Absent means one,
   * which is what everything that is actually trying to hurt you costs.
   *
   * It exists for pollen, and it belongs on the pathogen rather than on the case rule for the same
   * reason armour does: "harmless if it gets through" is a fact about the thing, and a rule that
   * made every leak free would be a rule the player wins by building nothing.
   */
  readonly leak?: number;
}

export const PATHOGENS: { readonly [K in PathogenKind]: PathogenStats } = {
  staph: { kind: 'staph', name: 'Staph', note: 'Fast, weak, endless', hp: 26, speed: 50, reward: 6, radius: 8, shape: 'circle', token: 'threat' },
  film: { kind: 'film', name: 'Biofilm', note: 'Armoured — tag it first', hp: 120, speed: 28, reward: 16, radius: 12, shape: 'square', token: 'armoured', armour: 0.25 },
  virus: { kind: 'virus', name: 'Flu virus', note: 'Splits when it dies', hp: 34, speed: 58, reward: 8, radius: 9, shape: 'circle', token: 'splitter', splits: true },
  spore: { kind: 'spore', name: 'Spore', note: 'Heals itself unless tagged', hp: 60, speed: 34, reward: 12, radius: 10, shape: 'circle', token: 'fungal', regen: 7 },
  toxin: { kind: 'toxin', name: 'Toxin', note: 'Stuns the cells it passes', hp: 44, speed: 40, reward: 14, radius: 11, shape: 'diamond', token: 'chemical', stun: 1.6 },
  mrsa: { kind: 'mrsa', name: 'Resistant', note: 'Tags do nothing — execute it, or grow a bigger cell', hp: 150, speed: 36, reward: 24, radius: 12, shape: 'circle', token: 'resistant', armour: 0.6, noTag: true },
  // The only thing in the table that does no damage at all, and — this is the part that took a
  // measured pass to find — it is also one of the toughest.
  //
  // Flimsy pollen makes the overreaction rule degenerate. Cells pick a target by position or by
  // wound, never by kind, so what a board kills is roughly what a board meets: at 14 health the
  // whole case collapses to `pips = leaks + kills/PIP`, both terms linear in one dial, and the best
  // play is always an end — kill everything or build nothing. Measured, that was 0 of 7776 boards.
  //
  // Health is what makes killing non-proportional. Damage lands on pollen in proportion to how
  // often it is the target, but *kills* divide that by health — so a stream that is nine parts
  // pollen still yields more staph deaths per unit of firepower than pollen deaths. Enough
  // firepower to clear the staph and no more becomes the interior optimum the rule needs, and the
  // fiction is better for it: pollen is not fragile, it is inert. Your cells wear themselves out
  // on something that was never going to hurt you.
  pollen: { kind: 'pollen', name: 'Pollen', note: 'Harmless, and heavy going — killing it is what costs you', hp: 70, speed: 46, reward: 2, radius: 9, shape: 'diamond', token: 'inert', leak: 0 },
  // The second splitter, and the first body that carries two of these flags at once.
  //
  // Splitting and regeneration answer to opposite plays on their own — a splitter rewards killing
  // late and in the right order, a regenerator rewards killing fast — and the mark is what resolves
  // them: a tag stops the knitting, so the cell that does no damage is the one that makes this
  // killable. It is the reason the season's second multiplying case is not its first one rewritten.
  //
  // The flu's vaccine does not touch it. `splitOnDeath` names the strain it suppresses, so a player
  // holding Flu B still meets everything this leaves behind.
  strep: { kind: 'strep', name: 'Strep', note: 'Splits when it dies, and knits itself back unless tagged', hp: 40, speed: 46, reward: 9, radius: 9, shape: 'circle', token: 'chaining', splits: true, regen: 5 },
  // Strain Vesper. Invented, tier 3, and the one body in the table that no vaccine and no mark
  // touches: `noTag` locks out the antibody entirely, and what the antibody cannot mark it also
  // cannot stop regenerating.
  //
  // That is the finale's whole design, in one row. The antibody is the cell that reaches — it holds
  // 70 to 89 per cent of the vessel from the spots the season lays, against a phagocyte's 35 to 62
  // — so every board that works everywhere else is built around it. Here it contributes nothing at
  // all, and the case has to be won with the short-ranged cells the geometry finally makes room for.
  vesper: { kind: 'vesper', name: 'Strain Vesper', note: 'Nothing binds to it, and it knits itself back together', hp: 46, speed: 40, reward: 20, radius: 11, shape: 'diamond', token: 'unknown', regen: 2, noTag: true },
};
