import { parseProfile } from './parseProfile';
import type { Profile } from '@game/progression';
import {
  STORAGE_KEY, STORAGE_VERSION, encode, type LoadResult, type ProgressRepository,
} from './ProgressRepository';

/**
 * A read failure is deliberately quiet — the player gets a fresh profile and the app keeps
 * working. A write failure is loud, because it is the one the player will notice and resent.
 */
export class LocalStorageProgressRepository implements ProgressRepository {
  load(): Promise<LoadResult> {
    let raw: string | null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      return Promise.resolve({ status: 'fresh', reason: 'corrupt' });
    }
    if (raw === null) return Promise.resolve({ status: 'fresh', reason: 'empty' });

    let envelope: unknown;
    try {
      envelope = JSON.parse(raw);
    } catch {
      return Promise.resolve({ status: 'fresh', reason: 'corrupt' });
    }

    if (typeof envelope !== 'object' || envelope === null) {
      return Promise.resolve({ status: 'fresh', reason: 'corrupt' });
    }
    const version = (envelope as { version?: unknown }).version;
    if (version !== STORAGE_VERSION) return Promise.resolve({ status: 'fresh', reason: 'outdated' });

    const profile = parseProfile((envelope as { profile?: unknown }).profile);
    if (profile === null) return Promise.resolve({ status: 'fresh', reason: 'corrupt' });
    return Promise.resolve({ status: 'loaded', profile });
  }

  save(profile: Profile): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEY, encode(profile));
      return Promise.resolve();
    } catch (cause) {
      return Promise.reject(new Error('Progress could not be saved on this device', { cause }));
    }
  }
}
