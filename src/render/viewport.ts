import { CASE_BY_ID } from '@game/content/cases';
import { BOARD_HEIGHT, BOARD_WIDTH, BUILD_SPOT_RADIUS } from '@game/content/rules';
import type { CaseId } from '@game/types';

export interface Viewport {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export const IDENTITY_VIEWPORT: Viewport = { scale: 1, offsetX: 0, offsetY: 0 };

/**
 * Contain fit: the whole board is always visible, letterboxed and centred.
 *
 * The prototype used a cover fit, but it drew into a fixed 374px-wide phone frame where
 * nothing could ever be cropped. On a responsive canvas cover crops the long axis — at
 * 390x844 it hides 47% of the board width, taking several build spots off screen with it.
 * A build spot the player cannot see is a build spot they cannot tap, so containing is the
 * only correct fit here. Letterboxing is invisible against the flat paper background.
 */
export function fitViewport(canvasWidth: number, canvasHeight: number): Viewport {
  const scale = Math.min(canvasWidth / BOARD_WIDTH, canvasHeight / BOARD_HEIGHT);
  return {
    scale,
    offsetX: (canvasWidth - BOARD_WIDTH * scale) / 2,
    offsetY: (canvasHeight - BOARD_HEIGHT * scale) / 2,
  };
}

export function worldToScreen(v: Viewport, x: number, y: number): [number, number] {
  return [x * v.scale + v.offsetX, y * v.scale + v.offsetY];
}

export function screenToWorld(v: Viewport, x: number, y: number): [number, number] {
  return [(x - v.offsetX) / v.scale, (y - v.offsetY) / v.scale];
}

/** The nearest build spot within its tap radius, in world coordinates. */
export function hitBuildSpot(caseId: CaseId, worldX: number, worldY: number): number | null {
  const spots = CASE_BY_ID[caseId].spots;
  let best: number | null = null;
  let bestDistance = BUILD_SPOT_RADIUS;

  for (let index = 0; index < spots.length; index += 1) {
    const spot = spots[index];
    if (spot === undefined) continue;
    const dx = spot[0] - worldX;
    const dy = spot[1] - worldY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= bestDistance) {
      bestDistance = d;
      best = index;
    }
  }

  return best;
}
