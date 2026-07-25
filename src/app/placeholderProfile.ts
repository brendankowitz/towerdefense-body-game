import { CASES } from '@game/content/cases';
import type { CaseId, StrainId } from '@game/types';

/**
 * Stand-in for the profile `@game/progression` will own once it lands (another agent is
 * building it concurrently — this does not create or wait for it). Map and Brief read it
 * through the single call below, so wiring the real provider is a one-line change at each
 * page — `PLACEHOLDER_PROFILE` becomes `useProfile().profile` and `placeholderNextCaseId`
 * becomes `nextCaseId` from `@game/progression`. Neither `BodyMap` nor `Brief` know this
 * placeholder exists; both take profile-derived data as plain props.
 */
export interface PlaceholderProfile {
  readonly day: number;
  readonly bank: number;
  readonly cleared: readonly CaseId[];
  readonly immunity: Readonly<Record<StrainId, number>>;
  /** Mirrors `Profile.kills` from `@game/progression` so the Immunity screen's run stats need no reshaping at swap time. */
  readonly kills: number;
}

/** Matches the fresh-profile factory in spec §5 (day 1, 240 banked, no immunity, nothing cleared). */
export const PLACEHOLDER_PROFILE: PlaceholderProfile = {
  day: 1,
  bank: 240,
  cleared: [],
  immunity: { staph: 0, virus: 0, film: 0 },
  kills: 0,
};

export function placeholderNextCaseId(cleared: readonly CaseId[]): CaseId | null {
  const next = CASES.find((c) => !cleared.includes(c.id));
  return next?.id ?? null;
}
