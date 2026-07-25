import { CASES } from '@game/content/cases';
import { IMMUNITY_MAX } from '@game/content/rules';
import type { CaseId, StrainId } from '@game/types';
import type { Profile } from './ProgressRepository';

const CASE_IDS: ReadonlySet<string> = new Set(CASES.map((entry) => entry.id));
const STRAINS: readonly StrainId[] = ['staph', 'film', 'virus'];

function isCaseId(value: unknown): value is CaseId {
  return typeof value === 'string' && CASE_IDS.has(value);
}

/** A non-negative integer counter — day, bank, kills, and each immunity value all share this shape. */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Hand-written and total rather than a schema library: one shape, a few dozen lines, no
 * dependency (see Global Constraints — abstract on the third real case, not the first).
 * Unknown extra keys are dropped rather than carried forward; every field is validated for
 * both type and range before the result is trusted.
 */
export function parseProfile(raw: unknown): Profile | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;

  if (!Array.isArray(record['cleared'])) return null;
  const cleared: CaseId[] = [];
  for (const entry of record['cleared']) {
    if (!isCaseId(entry)) return null;
    cleared.push(entry);
  }

  const rawImmunity = record['immunity'];
  if (typeof rawImmunity !== 'object' || rawImmunity === null || Array.isArray(rawImmunity)) return null;
  const immunityRecord = rawImmunity as Record<string, unknown>;
  const immunity = {} as Record<StrainId, number>;
  for (const strain of STRAINS) {
    const value = immunityRecord[strain];
    if (!isCount(value) || value > IMMUNITY_MAX) return null;
    immunity[strain] = value;
  }

  const { day, bank, kills } = record;
  if (!isCount(day) || !isCount(bank) || !isCount(kills)) return null;

  return { cleared, immunity, day, bank, kills };
}
