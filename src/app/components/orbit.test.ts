import { describe, expect, it } from 'vitest';
import {
  ORBIT_ANIMATION, ORBIT_KEYFRAMES, ORBIT_RX, ORBIT_RY, orbitKeyframes, orbitOffset,
} from './orbit';

/** Every offset is on the ellipse when this is 1. */
function ellipse(x: number, y: number): number {
  return (x / ORBIT_RX) ** 2 + (y / ORBIT_RY) ** 2;
}

describe('orbitOffset', () => {
  it('starts at the right of the ellipse', () => {
    const [x, y] = orbitOffset(0);
    expect(x).toBeCloseTo(ORBIT_RX, 12);
    expect(y).toBeCloseTo(0, 12);
  });

  it('is at the far side half way round', () => {
    const [x, y] = orbitOffset(0.5);
    expect(x).toBeCloseTo(-ORBIT_RX, 12);
    expect(y).toBeCloseTo(0, 12);
  });

  it('reaches the top and the bottom at the quarters', () => {
    expect(orbitOffset(0.25)[1]).toBeCloseTo(ORBIT_RY, 12);
    expect(orbitOffset(0.75)[1]).toBeCloseTo(-ORBIT_RY, 12);
  });

  it('closes on its own start', () => {
    const [x0, y0] = orbitOffset(0);
    const [x1, y1] = orbitOffset(1);
    expect(x1).toBeCloseTo(x0, 12);
    expect(y1).toBeCloseTo(y0, 12);
  });

  it('stays on the ellipse the whole way round', () => {
    for (let step = 0; step <= 32; step += 1) {
      const [x, y] = orbitOffset(step / 32);
      expect(ellipse(x, y)).toBeCloseTo(1, 12);
    }
  });

  /** An ellipse, not a circle: a region under attack sits in a body seen from the front. */
  it('is wider than it is tall', () => {
    expect(ORBIT_RX).toBeGreaterThan(ORBIT_RY);
    expect(Math.abs(orbitOffset(0)[0])).toBeGreaterThan(Math.abs(orbitOffset(0.25)[1]));
  });
});

describe('orbitKeyframes', () => {
  it('declares the animation typography.css asks for by name', () => {
    expect(ORBIT_KEYFRAMES.startsWith(`@keyframes ${ORBIT_ANIMATION}{`)).toBe(true);
    expect(ORBIT_KEYFRAMES.endsWith('}')).toBe(true);
  });

  it('writes one stop per step, plus the one that closes the loop', () => {
    expect(orbitKeyframes(4).match(/%\{/g)).toHaveLength(5);
  });

  it('runs from nought to a hundred per cent', () => {
    const css = orbitKeyframes(4);
    expect(css).toContain('0%{');
    expect(css).toContain('100%{');
    expect(css).toContain('50%{');
  });

  /** The track is what actually moves the halo, so it has to carry the ellipse's own numbers. */
  it('translates by the ellipse it was built from', () => {
    const css = orbitKeyframes(4);
    expect(css).toContain(`translate(${String(ORBIT_RX)}px,0px)`);
    expect(css).toContain(`translate(0px,${String(ORBIT_RY)}px)`);
    expect(css).toContain(`translate(-${String(ORBIT_RX)}px,0px)`);
  });

  it('ends where it began, so an infinite run has no seam', () => {
    const stops = [...orbitKeyframes(6).matchAll(/translate\([^)]*\)/g)].map(([stop]) => stop);
    expect(stops).toHaveLength(7);
    expect(stops.at(0)).toBe(stops.at(-1));
  });
});
