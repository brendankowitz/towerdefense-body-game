import { afterEach, describe, expect, it, vi } from 'vitest';

let native = false;

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => native },
}));

const { createProgressRepository } = await import('./createProgressRepository');
const { LocalStorageProgressRepository } = await import('./LocalStorageProgressRepository');
const { PreferencesProgressRepository } = await import('./PreferencesProgressRepository');

describe('createProgressRepository', () => {
  afterEach(() => { native = false; });

  it('selects the localStorage adapter off the native platform', () => {
    native = false;
    expect(createProgressRepository()).toBeInstanceOf(LocalStorageProgressRepository);
  });

  it('selects the Preferences adapter on the native platform', () => {
    native = true;
    expect(createProgressRepository()).toBeInstanceOf(PreferencesProgressRepository);
  });
});
