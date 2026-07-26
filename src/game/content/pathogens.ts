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
}

export const PATHOGENS: { readonly [K in PathogenKind]: PathogenStats } = {
  staph: { kind: 'staph', name: 'Staph', note: 'Fast, weak, endless', hp: 26, speed: 50, reward: 6, radius: 8, shape: 'circle', token: 'threat' },
  film: { kind: 'film', name: 'Biofilm', note: 'Armoured — tag it first', hp: 120, speed: 28, reward: 16, radius: 12, shape: 'square', token: 'armoured', armour: 0.25 },
  virus: { kind: 'virus', name: 'Flu virus', note: 'Splits when it dies', hp: 34, speed: 58, reward: 8, radius: 9, shape: 'circle', token: 'splitter', splits: true },
  spore: { kind: 'spore', name: 'Spore', note: 'Heals itself unless tagged', hp: 60, speed: 34, reward: 12, radius: 10, shape: 'circle', token: 'fungal', regen: 7 },
  toxin: { kind: 'toxin', name: 'Toxin', note: 'Stuns the cells it passes', hp: 44, speed: 40, reward: 14, radius: 11, shape: 'diamond', token: 'chemical', stun: 1.6 },
  mrsa: { kind: 'mrsa', name: 'Resistant', note: 'Tags do nothing — engulf it', hp: 150, speed: 36, reward: 24, radius: 12, shape: 'circle', token: 'resistant', armour: 0.6, noTag: true },
};
