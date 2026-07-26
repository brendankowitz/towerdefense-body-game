import { Graphics } from 'pixi.js';
import type { Point } from '@game/types';
import { dashArcs, diamondPoints, pointOnCircle } from './geometry';

/**
 * The whole art vocabulary. Shapes are flat and filled, and never outlined except to show
 * a range or an empty slot — so `ring` and `dashedRing` are the only strokes here that are
 * not a line, and every one of their callers is a range, a tag, a spot or a state.
 */

export function filledCircle(
  g: Graphics, x: number, y: number, radius: number, color: number, alpha = 1,
): void {
  g.circle(x, y, radius).fill({ color, alpha });
}

export function ring(
  g: Graphics, x: number, y: number, radius: number, color: number, width: number, alpha = 1,
): void {
  g.circle(x, y, radius).stroke({ color, width, alpha });
}

export function dashedRing(
  g: Graphics, x: number, y: number, radius: number, color: number, width: number,
  dash: number, gap: number, alpha = 1,
): void {
  // Each dash opens its own subpath. Without the moveTo, Pixi joins the arc to wherever
  // the previous instruction left the cursor and draws a spoke out to the ring.
  for (const arc of dashArcs(radius, dash, gap)) {
    const [startX, startY] = pointOnCircle(x, y, radius, arc.start);
    g.moveTo(startX, startY)
      .arc(x, y, radius, arc.start, arc.end)
      .stroke({ color, width, alpha });
  }
}

export function roundedSquare(
  g: Graphics, cx: number, cy: number, half: number, radius: number, color: number, alpha = 1,
): void {
  g.roundRect(cx - half, cy - half, half * 2, half * 2, radius).fill({ color, alpha });
}

export function diamond(
  g: Graphics, cx: number, cy: number, half: number, color: number, alpha = 1,
): void {
  polygon(g, diamondPoints(cx, cy, half), color, alpha);
}

export function polygon(
  g: Graphics, points: readonly Point[], color: number, alpha = 1,
): void {
  if (!trace(g, points)) return;
  g.closePath().fill({ color, alpha });
}

export function bar(
  g: Graphics, x: number, y: number, width: number, height: number, radius: number,
  color: number, alpha = 1,
): void {
  g.roundRect(x, y, width, height, radius).fill({ color, alpha });
}

export function thickLine(
  g: Graphics, x1: number, y1: number, x2: number, y2: number, color: number, width: number,
  alpha = 1,
): void {
  g.moveTo(x1, y1).lineTo(x2, y2).stroke({ color, width, alpha, cap: 'round' });
}

export function polyline(
  g: Graphics, points: readonly Point[], color: number, width: number, alpha = 1,
): void {
  if (!trace(g, points)) return;
  g.stroke({ color, width, alpha, cap: 'round', join: 'round' });
}

/** Walks a point list into the current path. False when there was nothing to walk. */
function trace(g: Graphics, points: readonly Point[]): boolean {
  let started = false;
  for (const [x, y] of points) {
    if (started) {
      g.lineTo(x, y);
    } else {
      g.moveTo(x, y);
      started = true;
    }
  }
  return started;
}
