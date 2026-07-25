import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageProgressRepository } from './LocalStorageProgressRepository';
import { STORAGE_KEY, encode, type Profile } from './ProgressRepository';
import { FRESH_PROFILE } from '@game/content/rules';

/**
 * `src/game/progression.ts` (and its `createFreshProfile()`) is being built concurrently and
 * did not exist when this suite was written. This mirrors the described factory shape, derived
 * from the shared `FRESH_PROFILE` content constant rather than a hardcoded day/bank — see the
 * report for this phase for the follow-up once `createFreshProfile()` lands.
 */
function testFreshProfile(): Profile {
  return {
    cleared: [],
    immunity: { staph: 0, film: 0, virus: 0 },
    day: FRESH_PROFILE.day,
    bank: FRESH_PROFILE.bank,
    kills: 0,
  };
}

describe('LocalStorageProgressRepository', () => {
  beforeEach(() => { localStorage.clear(); });
  // A mock left in place by a failed assertion would otherwise leak into later tests, since
  // several of these stub Storage.prototype directly rather than the localStorage instance.
  afterEach(() => { vi.restoreAllMocks(); });

  it('reports a fresh profile when nothing is stored', async () => {
    const result = await new LocalStorageProgressRepository().load();
    expect(result).toEqual({ status: 'fresh', reason: 'empty' });
  });

  it('round-trips a saved profile', async () => {
    const repository = new LocalStorageProgressRepository();
    const profile = { ...testFreshProfile(), day: testFreshProfile().day + 5, bank: testFreshProfile().bank + 660 };

    await repository.save(profile);
    const result = await repository.load();
    expect(result).toEqual({ status: 'loaded', profile });
  });

  it('falls back to fresh and reports corruption on unparseable JSON', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    const result = await new LocalStorageProgressRepository().load();
    expect(result).toEqual({ status: 'fresh', reason: 'corrupt' });
  });

  it('falls back to fresh and reports corruption on a valid-JSON invalid profile', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, profile: { day: 'soon' } }));
    const result = await new LocalStorageProgressRepository().load();
    expect(result).toEqual({ status: 'fresh', reason: 'corrupt' });
  });

  it('falls back to fresh rather than throwing when reading storage itself fails (private mode)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    const result = await new LocalStorageProgressRepository().load();
    expect(result).toEqual({ status: 'fresh', reason: 'corrupt' });
  });

  it('falls back to fresh and reports an outdated version', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, profile: testFreshProfile() }));
    const result = await new LocalStorageProgressRepository().load();
    expect(result).toEqual({ status: 'fresh', reason: 'outdated' });
  });

  it('treats the prototype’s unversioned save as outdated rather than crashing', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cleared: [], immunity: {}, day: 4, bank: 520 }));
    const result = await new LocalStorageProgressRepository().load();
    expect(result.status).toBe('fresh');
  });

  it('surfaces a failed write rather than swallowing it', async () => {
    const repository = new LocalStorageProgressRepository();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    await expect(repository.save(testFreshProfile())).rejects.toThrow(/could not be saved/i);
  });

  it('never leaves a half-written record after a failed write', async () => {
    const repository = new LocalStorageProgressRepository();
    await repository.save(testFreshProfile());
    const before = localStorage.getItem(STORAGE_KEY);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('nope'); });
    await expect(repository.save({ ...testFreshProfile(), day: testFreshProfile().day + 8 })).rejects.toThrow();

    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(before).toBe(encode(testFreshProfile()));
  });
});
