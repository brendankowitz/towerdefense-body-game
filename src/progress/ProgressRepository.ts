import type { Profile } from '@game/progression';

export const STORAGE_KEY = 'bodydefense.progress';
export const STORAGE_VERSION = 1;

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
