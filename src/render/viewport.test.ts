import { describe, expect, it } from 'vitest';
import { CASE_BY_ID } from '@game/content/cases';
import { BOARD_HEIGHT, BOARD_WIDTH, BUILD_SPOT_RADIUS } from '@game/content/rules';
import { fitViewport, hitBuildSpot, screenToWorld, worldToScreen } from './viewport';

const FOREARM_SPOTS = CASE_BY_ID.forearm.spots;

function spotAt(index: number): readonly [number, number] {
  const spot = FOREARM_SPOTS[index];
  if (spot === undefined) throw new Error(`Forearm has no build spot ${String(index)}`);
  return spot;
}

/** Scaling is a float multiply, so an exact board edge lands a hair either side of zero. */
const EPSILON = 1e-9;

/** Phone, tablet, and deliberately awkward aspect ratios. */
const CANVAS_SIZES: readonly (readonly [number, number])[] = [
  [390, 844], [320, 568], [430, 932], [768, 1024], [1024, 768], [320, 900], [900, 320],
];

describe('fitViewport', () => {
  it('is limited by height on a narrow canvas', () => {
    const v = fitViewport(BOARD_WIDTH, BOARD_HEIGHT * 2);
    expect(v.scale).toBe(1);
    expect(v.offsetX).toBe(0);
    expect(v.offsetY).toBe(BOARD_HEIGHT / 2);
  });

  it('is limited by width on a wide canvas', () => {
    const v = fitViewport(BOARD_WIDTH * 2, BOARD_HEIGHT);
    expect(v.scale).toBe(1);
    expect(v.offsetX).toBe(BOARD_WIDTH / 2);
    expect(v.offsetY).toBe(0);
  });

  it('is exactly 1:1 at the native size', () => {
    expect(fitViewport(BOARD_WIDTH, BOARD_HEIGHT)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it('keeps the whole board on screen at every canvas size', () => {
    for (const [width, height] of CANVAS_SIZES) {
      const v = fitViewport(width, height);
      const [left, top] = worldToScreen(v, 0, 0);
      const [right, bottom] = worldToScreen(v, BOARD_WIDTH, BOARD_HEIGHT);
      const where = `${String(width)}x${String(height)}`;

      expect(left, where).toBeGreaterThanOrEqual(-EPSILON);
      expect(top, where).toBeGreaterThanOrEqual(-EPSILON);
      expect(right, where).toBeLessThanOrEqual(width + EPSILON);
      expect(bottom, where).toBeLessThanOrEqual(height + EPSILON);
    }
  });

  // The reason contain replaced cover: a spot off screen is a spot the player cannot tap.
  it('keeps every build spot of every case tappable at every canvas size', () => {
    for (const [width, height] of CANVAS_SIZES) {
      const v = fitViewport(width, height);
      for (const definition of Object.values(CASE_BY_ID)) {
        for (const [wx, wy] of definition.spots) {
          const [x, y] = worldToScreen(v, wx, wy);
          const where = `${definition.id} spot at ${String(wx)},${String(wy)} on ${String(width)}x${String(height)}`;
          expect(x, where).toBeGreaterThanOrEqual(0);
          expect(x, where).toBeLessThanOrEqual(width);
          expect(y, where).toBeGreaterThanOrEqual(0);
          expect(y, where).toBeLessThanOrEqual(height);
        }
      }
    }
  });

  it('keeps the board centre at the canvas centre', () => {
    const v = fitViewport(430, 812);
    const [cx, cy] = worldToScreen(v, BOARD_WIDTH / 2, BOARD_HEIGHT / 2);
    expect(cx).toBeCloseTo(430 / 2, 6);
    expect(cy).toBeCloseTo(812 / 2, 6);
  });
});

describe('worldToScreen and screenToWorld', () => {
  it('round-trip for any point', () => {
    const v = fitViewport(500, 900);
    const [sx, sy] = worldToScreen(v, 187, 215);
    const [wx, wy] = screenToWorld(v, sx, sy);
    expect(wx).toBeCloseTo(187, 6);
    expect(wy).toBeCloseTo(215, 6);
  });

  it('maps the world origin to the viewport offset', () => {
    const v = fitViewport(500, 900);
    expect(worldToScreen(v, 0, 0)).toEqual([v.offsetX, v.offsetY]);
  });
});

describe('hitBuildSpot', () => {
  it('finds the spot when the tap lands on its centre', () => {
    for (let index = 0; index < FOREARM_SPOTS.length; index += 1) {
      const [x, y] = spotAt(index);
      expect(hitBuildSpot('forearm', x, y)).toBe(index);
    }
  });

  it('accepts a tap just inside the spot radius', () => {
    const [x, y] = spotAt(0);
    expect(hitBuildSpot('forearm', x + BUILD_SPOT_RADIUS - 0.5, y)).toBe(0);
  });

  it('rejects a tap just outside the spot radius', () => {
    const [x, y] = spotAt(0);
    expect(hitBuildSpot('forearm', x + BUILD_SPOT_RADIUS + 0.5, y)).toBeNull();
  });

  it('returns null for a tap on empty tissue', () => {
    expect(hitBuildSpot('forearm', 5, 5)).toBeNull();
  });

  it('resolves a slightly off-centre tap to the spot under it', () => {
    const [x, y] = spotAt(0);
    expect(hitBuildSpot('forearm', x + 1, y + 1)).toBe(0);
  });

  it('never has to choose, because no two spots are within one tap radius', () => {
    FOREARM_SPOTS.forEach((a, i) => {
      FOREARM_SPOTS.slice(i + 1).forEach((b) => {
        expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(BUILD_SPOT_RADIUS);
      });
    });
  });

  it('works for every case, since each declares its own spots', () => {
    for (const caseId of ['forearm', 'throat', 'stomach'] as const) {
      CASE_BY_ID[caseId].spots.forEach((spot, index) => {
        expect(hitBuildSpot(caseId, spot[0], spot[1])).toBe(index);
      });
    }
  });
});
