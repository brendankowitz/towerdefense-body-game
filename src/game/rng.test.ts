import { describe, expect, it } from 'vitest';
import { createRng, waveSeed } from './rng';

describe('createRng', () => {
  it('produces values in [0, 1)', () => {
    const rng = createRng(1);
    for (let i = 0; i < 1000; i += 1) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is reproducible for the same seed', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const left = Array.from({ length: 20 }, () => a.next());
    const right = Array.from({ length: 20 }, () => b.next());
    expect(left).toEqual(right);
  });

  it('diverges for different seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('exposes its internal state so a run can be serialised', () => {
    const original = createRng(7);
    const first = original.next();
    const checkpoint = original.state;
    const second = original.next();

    const resumed = createRng(checkpoint);
    expect(resumed.next()).toBe(second);
    expect(first).not.toBe(second);
  });
});

describe('waveSeed', () => {
  it('gives every (case, wave) pair its own seed', () => {
    const seeds = new Set<number>();
    for (const id of ['forearm', 'throat', 'stomach']) {
      for (let w = 0; w < 5; w += 1) seeds.add(waveSeed(id, w));
    }
    expect(seeds.size).toBe(15);
  });

  it('is stable across calls', () => {
    expect(waveSeed('forearm', 0)).toBe(waveSeed('forearm', 0));
  });

  it('returns an unsigned 32-bit integer', () => {
    const s = waveSeed('stomach', 4);
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});
