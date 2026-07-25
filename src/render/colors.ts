import { DEFENDERS } from '@game/content/defenders';
import { PATHOGENS } from '@game/content/pathogens';
import type { DefenderKind, PathogenKind } from '@game/types';
import { oklchToSrgbHex } from '@theme/oklch';
import { NEUTRALS, palette, type PaletteToken } from '@theme/tokens';

/** The one place a role token becomes a number Pixi will accept. */
export function tokenHex(token: PaletteToken): number {
  return palette[token].hex;
}

export function defenderHex(kind: DefenderKind): number {
  return tokenHex(DEFENDERS[kind].token);
}

export function pathogenHex(kind: PathogenKind): number {
  return tokenHex(PATHOGENS[kind].token);
}

/** Screen paper. Every glyph inside a cell body is cut out of the cell in this colour. */
export const PAPER = Number.parseInt(NEUTRALS.screenPaper.slice(1), 16);

/**
 * Drawing details, not roles.
 *
 * Each of these appears exactly once in the reference and describes how a shape is drawn
 * rather than what it means, so none of them earns a palette token — a token means "this
 * colour carries meaning a player can learn". They are resolved from the reference's own
 * oklch through the theme's converter rather than hand-copied as hex, so the reference
 * stays readable in the source and nobody has to trust an off-by-one conversion.
 *
 * Prototype lines 878–885 (empty spots), 902 (enemy core), 906 (enemy health).
 */
export const ENEMY_CORE = oklchToSrgbHex('oklch(0.35 0.09 20)');
export const ENEMY_HEALTH_FILL = oklchToSrgbHex('oklch(0.5 0.16 20)');
export const ENEMY_HEALTH_TRACK = oklchToSrgbHex('oklch(0.98 0.005 70)');
export const EMPTY_SPOT_FILL = oklchToSrgbHex('oklch(0.98 0.005 70)');
export const EMPTY_SPOT_STROKE = oklchToSrgbHex('oklch(0.72 0.03 60)');
export const EMPTY_SPOT_CROSS = oklchToSrgbHex('oklch(0.6 0.02 60)');

/** Unfilled health reads as ground already lost, which is what `notReached` means. */
export const TOWER_HEALTH_TRACK = tokenHex('notReached');
