import type { Profile } from '@game/progression';

export const STORAGE_KEY = 'bodydefense.progress';
/**
 * Bumped to 2 because a version-1 save has a cleared list and no front: restoring it would put
 * the player back on a map with no sickness on it and no day to spend, which is worse than
 * starting fresh.
 *
 * Bumped again to 3 for the same reason, one field over: a version-2 save carries `profile.day`
 * and `front.day` as two counters that were only ever kept in sync by every write going through
 * `clearCase` (`endDay` did not exist yet, so `front.day` never actually moved on its own).
 * `Profile.day` is gone now and `front.day` is the only day a run has, so restoring a version-2
 * save under the new shape would resurrect a stale `front.day` — silently rolling a played-in
 * run's day count backward while its bank, cleared list and immunity stayed put, which is a
 * worse experience than starting fresh and no more recoverable than a version-1 save was.
 * The version check alone turns both away before `parseProfile` ever runs.
 */
export const STORAGE_VERSION = 3;

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
