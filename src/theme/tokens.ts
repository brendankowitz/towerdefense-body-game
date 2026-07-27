import type { PaletteToken } from '@game/types';
import { oklchToSrgbHex } from './oklch';

// The simulation owns the role vocabulary; the theme decides what each role looks
// like. Type-only, so this carries no runtime dependency in either direction.
export type { PaletteToken };

const OKLCH: Record<PaletteToken, string> = {
  threat: 'oklch(0.66 0.15 25)',
  frontline: 'oklch(0.66 0.15 195)',
  support: 'oklch(0.7 0.14 145)',
  control: 'oklch(0.45 0.14 320)',
  energy: 'oklch(0.78 0.13 80)',
  execute: 'oklch(0.55 0.16 265)',
  burst: 'oklch(0.62 0.16 350)',
  learn: 'oklch(0.5 0.1 210)',
  armoured: 'oklch(0.58 0.16 15)',
  splitter: 'oklch(0.62 0.15 300)',
  fungal: 'oklch(0.6 0.11 115)',
  chemical: 'oklch(0.52 0.13 45)',
  resistant: 'oklch(0.42 0.13 10)',
  // Pollen. The one threat token that is not a warning: pale and warm, so the board reads it as
  // something drifting past rather than as something to shoot.
  inert: 'oklch(0.8 0.09 95)',
  fever: 'oklch(0.58 0.16 15)',
  notReached: 'oklch(0.9 0.014 60)',
  vesselCasing: 'oklch(0.87 0.05 20)',
  vesselLumen: 'oklch(0.93 0.03 20)',
  tissueField: 'oklch(0.95 0.012 40)',
  core: 'oklch(0.78 0.13 80)',
};

export const NEUTRALS = {
  deskPaper: '#F4EFE6',
  screenPaper: '#FBF7F0',
  ink: '#2C2A28',
} as const;

/** Reserved for the Lymph Lines direction. Defined so nobody reinvents it; used nowhere. */
export const NIGHT = {
  base: '#20232B',
  raised: 'oklch(0.24 0.012 260)',
  line: 'oklch(0.34 0.02 260)',
  ink: '#F2F4F8',
} as const;

export const palette = Object.fromEntries(
  Object.entries(OKLCH).map(([token, css]) => [token, { css, hex: oklchToSrgbHex(css) }]),
) as Record<PaletteToken, { readonly css: string; readonly hex: number }>;
