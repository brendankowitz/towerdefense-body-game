import type { CaseId, StrainId } from '@game/types';

/**
 * Mirrors the shape `src/game/progression.ts` is expected to export (spec §8; plan Phase 11:
 * `Profile`, `createFreshProfile()`, `FRESH_PROFILE`). That module is being built concurrently
 * by another agent and did not exist yet when this port was written, so the shape is declared
 * here from the spec instead of imported. Once `progression.ts` lands, replace this declaration
 * with `import type { Profile } from '@game/progression';` and delete it.
 */
export interface Profile {
  readonly cleared: readonly CaseId[];
  readonly immunity: Readonly<Record<StrainId, number>>;
  readonly day: number;
  readonly bank: number;
  readonly kills: number;
}

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
