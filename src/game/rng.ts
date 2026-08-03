export interface Rng {
  next(): number;
  readonly state: number;
}

/** mulberry32. Chosen for a 32-bit state that serialises into sim state as one number. */
export function createRng(seed: number): Rng {
  let counter = seed >>> 0;
  return {
    next(): number {
      counter = (counter + 0x6d2b79f5) >>> 0;
      let value = Math.imul(counter ^ (counter >>> 15), 1 | counter);
      value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    },
    get state(): number {
      return counter;
    },
  };
}

/** FNV-1a over the case id, mixed with the wave index. */
export function waveSeed(caseId: string, waveIndex: number): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < caseId.length; i += 1) {
    hash ^= caseId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= Math.imul(waveIndex + 1, 0x9e3779b1);
  return hash >>> 0;
}

/**
 * Folds one fact into a seed, with `waveSeed`'s own mixing step and one more round of the FNV
 * prime so a single changed fact moves the whole word rather than its low bits.
 *
 * Exists because `waveSeed` is not the only thing that has facts to fold in. A seed built from the
 * case and the wave is the same seed on every board of that case, which is exactly right for the
 * spawn order — the queue a wave sends is a property of the wave — and exactly wrong for anything
 * that is meant to differ between the games played on it. A caller with a board's own facts on hand
 * chains this over them rather than writing a second mixer beside `waveSeed`.
 *
 * **Integers only.** `| 0` truncates, so two facts a fraction apart fold in identically and a
 * fractional field folded in here is quietly a coarser fact than it looks. Every caller passes a
 * count, an index or a pip.
 */
export function mixSeed(seed: number, value: number): number {
  return Math.imul(seed ^ Math.imul(value | 0, 0x9e3779b1), 0x01000193) >>> 0;
}
