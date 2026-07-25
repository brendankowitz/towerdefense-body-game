import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFreshProfile } from '@game/progression';

const store = new Map<string, string>();
let failNextSet = false;
let failNextGet = false;

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(({ key }: { key: string }) => {
      if (failNextGet) {
        failNextGet = false;
        return Promise.reject(new Error('native read failed'));
      }
      return Promise.resolve({ value: store.get(key) ?? null });
    }),
    set: vi.fn(({ key, value }: { key: string; value: string }) => {
      if (failNextSet) {
        failNextSet = false;
        return Promise.reject(new Error('native write failed'));
      }
      store.set(key, value);
      return Promise.resolve();
    }),
  },
}));

// Imported after the mock so the module under test picks up the mocked binding.
const { PreferencesProgressRepository } = await import('./PreferencesProgressRepository');
const { STORAGE_KEY } = await import('./ProgressRepository');

describe('PreferencesProgressRepository', () => {
  beforeEach(() => {
    store.clear();
    failNextSet = false;
    failNextGet = false;
  });

  it('reports a fresh profile when nothing is stored', async () => {
    const result = await new PreferencesProgressRepository().load();
    expect(result).toEqual({ status: 'fresh', reason: 'empty' });
  });

  it('round-trips a saved profile', async () => {
    const repository = new PreferencesProgressRepository();
    const fresh = createFreshProfile();
    const profile = { ...fresh, day: fresh.day + 5, bank: fresh.bank + 660 };

    await repository.save(profile);
    const result = await repository.load();
    expect(result).toEqual({ status: 'loaded', profile });
  });

  it('falls back to fresh and reports corruption on unparseable JSON', async () => {
    store.set(STORAGE_KEY, '{not json');
    const result = await new PreferencesProgressRepository().load();
    expect(result).toEqual({ status: 'fresh', reason: 'corrupt' });
  });

  it('falls back to fresh and reports corruption on a valid-JSON invalid profile', async () => {
    store.set(STORAGE_KEY, JSON.stringify({ version: 1, profile: { day: 'soon' } }));
    const result = await new PreferencesProgressRepository().load();
    expect(result).toEqual({ status: 'fresh', reason: 'corrupt' });
  });

  it('falls back to fresh and reports an outdated version', async () => {
    store.set(STORAGE_KEY, JSON.stringify({ version: 99, profile: createFreshProfile() }));
    const result = await new PreferencesProgressRepository().load();
    expect(result).toEqual({ status: 'fresh', reason: 'outdated' });
  });

  it('falls back to fresh rather than throwing when the native read itself fails', async () => {
    failNextGet = true;
    const result = await new PreferencesProgressRepository().load();
    expect(result).toEqual({ status: 'fresh', reason: 'corrupt' });
  });

  it('surfaces a failed write rather than swallowing it', async () => {
    const repository = new PreferencesProgressRepository();
    failNextSet = true;
    await expect(repository.save(createFreshProfile())).rejects.toThrow(/could not be saved/i);
  });

  it('never leaves a half-written record after a failed write', async () => {
    const repository = new PreferencesProgressRepository();
    await repository.save(createFreshProfile());
    const before = store.get(STORAGE_KEY);

    failNextSet = true;
    await expect(repository.save({ ...createFreshProfile(), day: createFreshProfile().day + 8 })).rejects.toThrow();

    expect(store.get(STORAGE_KEY)).toBe(before);
  });
});
