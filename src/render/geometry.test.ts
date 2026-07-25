import { describe, expect, it } from 'vitest';
import { PATHOGENS } from '@game/content/pathogens';
import { SPLIT_RADIUS_FACTOR } from '@game/content/rules';
import {
  MIN_DASH_COUNT,
  dashArcs,
  diamondPoints,
  enemyRadius,
  healthBarWidth,
  pointOnCircle,
  quantise,
  squareToDiamondHalf,
} from './geometry';

const TAU = Math.PI * 2;

describe('dashArcs', () => {
  it('lays every dash out at the same angular pitch', () => {
    const arcs = dashArcs(40, 6, 6);
    const pitches = arcs.slice(1).map((arc, i) => {
      const previous = arcs[i];
      if (previous === undefined) throw new Error('unreachable');
      return arc.start - previous.start;
    });
    for (const pitch of pitches) expect(pitch).toBeCloseTo(TAU / arcs.length, 10);
  });

  it('gives every dash the same fraction of its pitch as dash is of dash + gap', () => {
    const dash = 7;
    const gap = 6;
    const arcs = dashArcs(62, dash, gap);
    const pitch = TAU / arcs.length;
    for (const arc of arcs) {
      expect((arc.end - arc.start) / pitch).toBeCloseTo(dash / (dash + gap), 10);
    }
  });

  it('starts at zero and wraps exactly once', () => {
    const arcs = dashArcs(24, 6, 6);
    expect(arcs[0]?.start).toBe(0);
    const last = arcs.at(-1);
    expect(last).toBeDefined();
    expect(last?.start).toBeLessThan(TAU);
    expect((last?.start ?? 0) + TAU / arcs.length).toBeCloseTo(TAU, 10);
  });

  it('adds dashes as the ring grows', () => {
    expect(dashArcs(94, 6, 6).length).toBeGreaterThan(dashArcs(24, 6, 6).length);
  });

  it('never drops below the minimum, however small the ring', () => {
    expect(dashArcs(0.1, 6, 6)).toHaveLength(MIN_DASH_COUNT);
    expect(dashArcs(0, 6, 6)).toHaveLength(MIN_DASH_COUNT);
  });

  it('leaves a gap between consecutive dashes', () => {
    const arcs = dashArcs(56, 4, 6);
    arcs.slice(0, -1).forEach((arc, i) => {
      const next = arcs[i + 1];
      expect(next).toBeDefined();
      expect(next?.start ?? 0).toBeGreaterThan(arc.end);
    });
  });
});

describe('diamondPoints', () => {
  it('puts one corner on each axis, half a width from the centre', () => {
    expect(diamondPoints(10, 20, 6)).toEqual([[10, 14], [16, 20], [10, 26], [4, 20]]);
  });

  it('has every corner exactly half a width from the centre', () => {
    for (const [x, y] of diamondPoints(-3, 7, 11)) {
      expect(Math.hypot(x - -3, y - 7)).toBeCloseTo(11, 10);
    }
  });

  it('encloses the same area as the square it is a rotation of', () => {
    const half = 8;
    const points = diamondPoints(0, 0, half);
    const area = points.reduce((sum, point, i) => {
      const next = points[(i + 1) % points.length];
      if (next === undefined) throw new Error('unreachable');
      return sum + (point[0] * next[1] - next[0] * point[1]);
    }, 0) / 2;
    expect(Math.abs(area)).toBeCloseTo((2 * half) ** 2 / 2, 10);
  });
});

describe('pointOnCircle', () => {
  it('puts angle zero on the positive x axis', () => {
    const [x, y] = pointOnCircle(10, 20, 5, 0);
    expect(x).toBeCloseTo(15, 10);
    expect(y).toBeCloseTo(20, 10);
  });

  it('lands every angle exactly on the circle', () => {
    for (const angle of [0, 0.4, Math.PI / 2, Math.PI, 4.7, TAU]) {
      const [x, y] = pointOnCircle(-2, 6, 13, angle);
      expect(Math.hypot(x - -2, y - 6)).toBeCloseTo(13, 10);
    }
  });

  it('agrees with where each dash of a dashed ring starts', () => {
    const radius = 24;
    for (const arc of dashArcs(radius, 6, 6)) {
      const [x, y] = pointOnCircle(0, 0, radius, arc.start);
      expect(Math.hypot(x, y)).toBeCloseTo(radius, 10);
    }
  });
});

describe('squareToDiamondHalf', () => {
  it('preserves the area of the square it turns', () => {
    const halfSide = 6;
    const points = diamondPoints(0, 0, squareToDiamondHalf(halfSide));
    const [top, right, bottom, left] = points;
    expect(top).toBeDefined();
    expect(right).toBeDefined();
    expect(bottom).toBeDefined();
    expect(left).toBeDefined();
    const diagonal = (bottom?.[1] ?? 0) - (top?.[1] ?? 0);
    const otherDiagonal = (right?.[0] ?? 0) - (left?.[0] ?? 0);
    expect((diagonal * otherDiagonal) / 2).toBeCloseTo((halfSide * 2) ** 2, 10);
  });

  it('puts the corners further out than the square edges they came from', () => {
    expect(squareToDiamondHalf(6)).toBeGreaterThan(6);
  });
});

describe('enemyRadius', () => {
  it('draws an original at its content radius', () => {
    expect(enemyRadius(PATHOGENS.virus.radius, 0)).toBe(PATHOGENS.virus.radius);
  });

  it('shrinks a split child by the content split factor', () => {
    expect(enemyRadius(PATHOGENS.virus.radius, 1))
      .toBeCloseTo(PATHOGENS.virus.radius * SPLIT_RADIUS_FACTOR, 10);
  });

  it('always draws a child smaller than its parent', () => {
    for (const stats of Object.values(PATHOGENS)) {
      expect(enemyRadius(stats.radius, 1)).toBeLessThan(enemyRadius(stats.radius, 0));
    }
  });
});

describe('healthBarWidth', () => {
  it('fills the whole track at full health', () => {
    expect(healthBarWidth(28, PATHOGENS.film.hp, PATHOGENS.film.hp)).toBe(28);
  });

  it('fills half the track at half health', () => {
    expect(healthBarWidth(28, PATHOGENS.film.hp / 2, PATHOGENS.film.hp)).toBe(14);
  });

  it('clamps negative health to an empty bar rather than drawing backwards', () => {
    expect(healthBarWidth(28, -40, PATHOGENS.staph.hp)).toBe(0);
  });

  it('clamps overheal to a full bar rather than overdrawing the track', () => {
    expect(healthBarWidth(28, PATHOGENS.spore.hp * 2, PATHOGENS.spore.hp)).toBe(28);
  });

  it('is zero rather than NaN when maxHp is zero', () => {
    expect(healthBarWidth(28, 0, 0)).toBe(0);
  });
});

describe('quantise', () => {
  it('collapses a continuous drain into whole steps', () => {
    expect(quantise(0.5, 24)).toBe(12);
    expect(quantise(0.5 + 1 / 96, 24)).toBe(12);
  });

  it('changes step once the fraction crosses half a step', () => {
    expect(quantise(0.5 + 1 / 48, 24)).toBe(13);
  });

  it('clamps outside the unit interval', () => {
    expect(quantise(-1, 24)).toBe(0);
    expect(quantise(2, 24)).toBe(24);
  });
});
