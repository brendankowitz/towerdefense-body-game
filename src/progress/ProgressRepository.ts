import type { Profile } from '@game/progression';

export const STORAGE_KEY = 'bodydefense.progress';
/**
 * Bumped to 2 because a version-1 save has a cleared list and no front: restoring it would put
 * the player back on a map with no sickness on it and no day to spend, which is worse than
 * starting fresh. The version check alone turns that save away before `parseProfile` ever runs.
 */
export const STORAGE_VERSION = 2;

export interface StoredEnvelope {
  readonly version: number;
  readonly profile: unknown;
}

export type LoadResult =
  | { readonly status: 'loaded'; readonly profile: Profile }
  | { readonly status: 'fresh'; readonly reason: 'empty' | 'corrupt' | 'outdated' };

export interface ProgressRepository {
  load(): Promise<LoadResult>;
  /** Rejects when the write fails. Losing a cleared case silently is the one failure players resent. */
  save(profile: Profile): Promise<void>;
}

export function encode(profile: Profile): string {
  return JSON.stringify({ version: STORAGE_VERSION, profile } satisfies StoredEnvelope);
}
