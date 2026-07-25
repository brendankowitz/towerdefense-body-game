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
