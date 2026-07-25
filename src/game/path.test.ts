import { describe, expect, it } from 'vitest';
import { compilePath, positionAt } from './path';
import { CASES } from './content/cases';

describe('compilePath', () => {
  it('accumulates segment lengths into a total', () => {
    const path = compilePath([[0, 0], [3, 4], [3, 14]]);
    expect(path.segments).toHaveLength(2);
    expect(path.segments[0].length).toBe(5);
    expect(path.segments[1]?.length).toBe(10);
    expect(path.total).toBe(15);
  });

  it('records where each segment starts', () => {
    const path = compilePath([[0, 0], [3, 4], [3, 14]]);
    expect(path.segments[0].start).toBe(0);
    expect(path.segments[1]?.start).toBe(5);
  });

  it('rejects a path with fewer than two points', () => {
    expect(() => compilePath([[0, 0]])).toThrow(/at least two points/i);
    expect(() => compilePath([])).toThrow(/at least two points/i);
  });

  it('compiles every shipped case path into one segment per gap', () => {
    for (const shipped of CASES) {
      expect(compilePath(shipped.path).segments).toHaveLength(shipped.path.length - 1);
    }
  });
});

describe('positionAt', () => {
  const path = compilePath([[0, 0], [10, 0], [10, 10]]);

  it('returns the first point at distance zero', () => {
    expect(positionAt(path, 0)).toEqual([0, 0]);
  });

  it('interpolates within a segment', () => {
    expect(positionAt(path, 5)).toEqual([5, 0]);
  });

  it('crosses into the next segment', () => {
    expect(positionAt(path, 13)).toEqual([10, 3]);
  });

  it('clamps to the last point past the end', () => {
    expect(positionAt(path, 999)).toEqual([10, 10]);
  });

  it('clamps to the first point for a negative distance', () => {
    expect(positionAt(path, -5)).toEqual([0, 0]);
  });

  it('advances monotonically along a path with a zero-length segment', () => {
    const degenerate = compilePath([[0, 0], [0, 0], [10, 0]]);
    expect(positionAt(degenerate, 0)).toEqual([0, 0]);
    expect(positionAt(degenerate, 4)).toEqual([4, 0]);
  });

  it('walks every shipped case path without producing NaN', () => {
    for (const shipped of CASES) {
      const compiled = compilePath(shipped.path);
      for (let travelled = 0; travelled <= compiled.total; travelled += 7) {
        const [x, y] = positionAt(compiled, travelled);
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
      }
    }
  });
});
