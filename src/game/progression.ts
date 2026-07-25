import { CASES, CASE_BY_ID } from './content/cases';
import { LATER } from './content/later';
import { CASE_CLEAR_BANK, FRESH_PROFILE, IMMUNITY_MAX } from './content/rules';
import { STRAIN_ROWS, VACCINES } from './content/vaccines';
import type { CaseId, StrainId, Tier } from './types';

/** Everything a run carries between cases. The simulation reads it; only this module writes it. */
export interface Profile {
  readonly cleared: readonly CaseId[];
  readonly immunity: Readonly<Record<StrainId, number>>;
  readonly day: number;
  readonly bank: number;
  readonly kills: number;
}

/**
 * The one fresh profile. First run and "Start a new body" are the same state (decision D7) —
 * the prototype's day-4 opening was demo staging. A new object every call, so nothing that
 * spreads or stores a profile can reach back and change what the next new body starts from.
 */
export function createFreshProfile(): Profile {
  return {
    cleared: [],
    immunity: { staph: 0, film: 0, virus: 0 },
    day: FRESH_PROFILE.day,
    bank: FRESH_PROFILE.bank,
    kills: 0,
  };
}

/**
 * Clearing a case advances the day, banks the reward and raises the immunity of the strain the
 * case declares it credits (decision D6) — not a branch on the illness type, which left the
 * Biofilm serum permanently unearnable. `cleared` is an ordered unique list (decision D4).
 */
export function clearCase(profile: Profile, caseId: CaseId, totalKills: number): Profile {
  const strain = CASE_BY_ID[caseId].credits;
  return {
    cleared: profile.cleared.includes(caseId) ? profile.cleared : [...profile.cleared, caseId],
    immunity: {
      ...profile.immunity,
      [strain]: Math.min(IMMUNITY_MAX, profile.immunity[strain] + 1),
    },
    day: profile.day + 1,
    bank: profile.bank + CASE_CLEAR_BANK,
    kills: totalKills,
  };
}

/** The case the body needs next, or null when nothing is left today. */
export function nextCaseId(profile: Profile): CaseId | null {
  return CASES.find((definition) => !profile.cleared.includes(definition.id))?.id ?? null;
}

export interface StrainRow {
  readonly key: StrainId;
  readonly name: string;
  readonly effect: string;
  readonly progress: string;
  readonly held: boolean;
}

export function strainRows(profile: Profile): readonly StrainRow[] {
  return STRAIN_ROWS.map(({ key, name, effect }) => {
    const count = profile.immunity[key];
    const held = count >= IMMUNITY_MAX;
    return {
      key,
      name,
      effect,
      held,
      progress: held ? 'DONE' : `${String(count)}/${String(IMMUNITY_MAX)}`,
    };
  });
}

export type VaccineStatus = 'held' | 'progress' | 'available' | 'locked' | 'none';

export interface VaccineRow {
  readonly name: string;
  readonly effect: string;
  readonly cost: string;
  readonly label: string;
  readonly status: VaccineStatus;
}

export function vaccineRows(profile: Profile): readonly VaccineRow[] {
  return VACCINES.map((vaccine) => {
    let status: VaccineStatus = 'none';
    let label = 'NONE EXISTS';

    if (vaccine.strain !== undefined) {
      const count = profile.immunity[vaccine.strain];
      status = count >= IMMUNITY_MAX ? 'held' : 'progress';
      label = status === 'held' ? 'HELD' : `${String(count)}/${String(IMMUNITY_MAX)}`;
    } else if (vaccine.gate !== undefined) {
      status = profile.cleared.length >= vaccine.gate ? 'available' : 'locked';
      label = status === 'available' ? 'AVAILABLE' : 'LOCKED';
    }

    // Only the gated vaccines carry a cost; content decides that, so the row just passes it on.
    return {
      name: vaccine.name,
      effect: vaccine.effect,
      cost: vaccine.cost ?? '',
      label,
      status,
    };
  });
}

export type SeasonState = 'done' | 'now' | 'next' | 'warn' | 'unknown';

export interface SeasonRow {
  readonly day: number;
  readonly name: string;
  readonly region: string;
  readonly note: string;
  readonly tier: Tier;
  readonly state: SeasonState;
}

/** "FOREARM · CASE 04" is the fight-screen kicker; the timeline wants just "Forearm". */
function regionName(region: string): string {
  const head = region.split(' · ')[0] ?? region;
  const lower = head.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * The season timeline: every case, then everything the season promises but cannot yet be played.
 * Days are counted from today, so the case you are on is always day `profile.day`.
 */
export function seasonRows(profile: Profile): readonly SeasonRow[] {
  const nextIndex = Math.max(0, CASES.findIndex((definition) => !profile.cleared.includes(definition.id)));

  const cases: SeasonRow[] = CASES.map((definition, index) => {
    const done = profile.cleared.includes(definition.id);
    return {
      day: profile.day + (index - nextIndex),
      name: definition.title,
      region: regionName(definition.region),
      note: done ? 'Cleared — this region is holding' : '',
      tier: 1,
      state: done ? 'done' : index === nextIndex ? 'now' : 'next',
    };
  });

  const later: SeasonRow[] = LATER.map((entry) => ({
    day: profile.day + entry.offset,
    name: entry.name,
    region: entry.region,
    note: entry.note,
    tier: entry.tier,
    state: entry.tier === 3 ? 'unknown' : 'warn',
  }));

  return [...cases, ...later];
}
