import { SPLIT_RADIUS_FACTOR } from '@game/content/rules';
import type { Enemy, Point } from '@game/types';

const TAU = Math.PI * 2;

/** Below this a dashed ring reads as a broken circle rather than a dashed one. */
export const MIN_DASH_COUNT = 4;

/** One dash of a dashed circle, as start and end angles in radians. */
export interface DashArc {
  readonly start: number;
  readonly end: number;
}

/**
 * Pixi has no dashed stroke, so a dashed ring is approximated by arcs. The dash count is
 * rounded rather than truncated so the pattern closes on itself instead of leaving one
 * ragged gap where the ring meets its own start.
 */
export function dashArcs(radius: number, dash: number, gap: number): readonly DashArc[] {
  const period = dash + gap;
  const count = Math.max(MIN_DASH_COUNT, Math.round((TAU * radius) / period));
  const step = TAU / count;
  const filled = step * (dash / period);

  const arcs: DashArc[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = i * step;
    arcs.push({ start, end: start + filled });
  }
  return arcs;
}

/**
 * A square standing on its corner. Drawn from its own points rather than by rotating a
 * rect, so the shape is a plain filled polygon with no transform to keep in sync.
 */
export function diamondPoints(cx: number, cy: number, half: number): readonly Point[] {
  return [
    [cx, cy - half],
    [cx + half, cy],
    [cx, cy + half],
    [cx - half, cy],
  ];
}

/** A point on a circle at the given angle. */
export function pointOnCircle(
  cx: number, cy: number, radius: number, angle: number,
): Point {
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

/**
 * Half-diagonal of a square standing on its corner. The reference draws its diamonds as
 * squares with a 45° transform; `diamond` draws the polygon directly, so callers convert
 * the half-side they would have given a square into the corner distance a diamond takes.
 */
export function squareToDiamondHalf(halfSide: number): number {
  return halfSide * Math.SQRT2;
}

/**
 * Split children are drawn smaller, so a divided pathogen reads as two lesser threats.
 *
 * Only children. A dormancy case's revenant comes back weakened and full size on purpose: it is
 * the same body got back up, not a body divided, and shrinking it would spell one mechanic with
 * the other's vocabulary. What says it is a revenant is that it appears in the middle of the
 * vessel out of nothing, and the health bar over it.
 *
 * Typed off `Enemy` rather than restating the union, because the union has grown once already.
 */
export function enemyRadius(baseRadius: number, generation: Enemy['generation']): number {
  return generation === 1 ? baseRadius * SPLIT_RADIUS_FACTOR : baseRadius;
}

/** Filled width of a health bar. Clamped so a dying or overhealed body never overdraws. */
export function healthBarWidth(trackWidth: number, hp: number, maxHp: number): number {
  if (maxHp <= 0) return 0;
  return trackWidth * Math.min(1, Math.max(0, hp / maxHp));
}

/**
 * Quantises a fraction into whole steps. Layers compare quantised values to decide whether
 * a body's geometry needs rebuilding, so a health bar repaints once per visible pixel of
 * change rather than on every frame of a continuous drain.
 */
export function quantise(fraction: number, steps: number): number {
  return Math.round(Math.min(1, Math.max(0, fraction)) * steps);
}
