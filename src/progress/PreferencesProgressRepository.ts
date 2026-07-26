import { Preferences } from '@capacitor/preferences';
import { parseProfile } from './parseProfile';
import type { Profile } from '@game/progression';
import {
  STORAGE_KEY, STORAGE_VERSION, encode, type LoadResult, type ProgressRepository,
} from './ProgressRepository';

/**
 * The native counterpart of {@link LocalStorageProgressRepository}. Envelope handling is
 * duplicated between the two rather than shared through a base class: two implementations is
 * not the third real case (see Global Constraints — no premature abstraction). If a third
 * storage backend ever appears, extract then.
 */
export class PreferencesProgressRepository implements ProgressRepository {
  async load(): Promise<LoadResult> {
    let raw: string | null;
    try {
      ({ value: raw } = await Preferences.get({ key: STORAGE_KEY }));
    } catch {
      return { status: 'fresh', reason: 'corrupt' };
    }
    if (raw === null) return { status: 'fresh', reason: 'empty' };

    let envelope: unknown;
    try {
      envelope = JSON.parse(raw);
    } catch {
      return { status: 'fresh', reason: 'corrupt' };
    }

    if (typeof envelope !== 'object' || envelope === null) return { status: 'fresh', reason: 'corrupt' };
    if ((envelope as { version?: unknown }).version !== STORAGE_VERSION) {
      return { status: 'fresh', reason: 'outdated' };
    }

    const profile = parseProfile((envelope as { profile?: unknown }).profile);
    return profile === null ? { status: 'fresh', reason: 'corrupt' } : { status: 'loaded', profile };
  }

  async save(profile: Profile): Promise<void> {
    try {
      await Preferences.set({ key: STORAGE_KEY, value: encode(profile) });
    } catch (cause) {
      throw new Error('Progress could not be saved on this device', { cause });
    }
  }
}
