import { BODY_NODES } from '@game/content/body';
import { CASES } from '@game/content/cases';
import { IMMUNITY_MAX } from '@game/content/rules';
import type { Front } from '@game/front';
import type { BodyNodeId, CaseId, StrainId } from '@game/types';
import type { Profile } from '@game/progression';

const CASE_IDS: ReadonlySet<string> = new Set(CASES.map((entry) => entry.id));
const STRAINS: readonly StrainId[] = ['staph', 'film', 'virus'];
const NODE_IDS: ReadonlySet<string> = new Set(BODY_NODES.map((node) => node.id));

function isCaseId(value: unknown): value is CaseId {
  return typeof value === 'string' && CASE_IDS.has(value);
}

/** A non-negative integer counter — day, bank, kills, and each immunity value all share this shape. */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function parseNodes(value: unknown): BodyNodeId[] | null {
  if (!Array.isArray(value)) return null;
  const nodes: BodyNodeId[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !NODE_IDS.has(entry)) return null;
    nodes.push(entry as BodyNodeId);
  }
  return nodes;
}

/**
 * Total, like everything else here: anything that is not exactly a front is a corrupt save, and
 * the repository already turns null into a fresh body rather than a crash. A siege on ground the
 * save does not claim to hold is the one cross-field check worth making — it is what a
 * hand-edited or half-written save looks like.
 */
function parseFront(value: unknown): Front | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;

  const infected = parseNodes(raw.infected);
  const held = parseNodes(raw.held);
  if (infected === null || held === null) return null;
  if (typeof raw.day !== 'number' || !Number.isInteger(raw.day) || raw.day < 1) return null;
  if (typeof raw.rngState !== 'number' || !Number.isFinite(raw.rngState)) return null;
  // An array also satisfies `typeof === 'object'` and is let through here rather than rejected
  // outright: it cannot crash and it cannot come from this game, because `Object.entries` over
  // one yields numeric-index keys, none of which is ever a `BodyNodeId` — a non-empty array
  // fails the `NODE_IDS.has` check below and an empty one just degrades to `siege: {}`.
  if (typeof raw.siege !== 'object' || raw.siege === null) return null;

  const siege: Partial<Record<BodyNodeId, number>> = {};
  for (const [node, days] of Object.entries(raw.siege)) {
    if (!NODE_IDS.has(node)) return null;
    if (typeof days !== 'number' || !Number.isInteger(days) || days < 0) return null;
    if (!held.includes(node as BodyNodeId)) return null;
    siege[node as BodyNodeId] = days;
  }

  // Absent rather than rejected: every save written before the last stand existed has no `lost`
  // at all, and it is telling the truth — a run in progress before this field existed had not
  // lost the heart case, because there was no heart case yet to lose. Present and not a boolean
  // is the one shape that is actually corrupt.
  if (raw.lost !== undefined && typeof raw.lost !== 'boolean') return null;
  const lost = raw.lost === true;

  return { infected, held, siege, day: raw.day, rngState: raw.rngState, lost };
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

  const { bank, kills } = record;
  if (!isCount(bank) || !isCount(kills)) return null;

  const front = parseFront(record['front']);
  if (front === null) return null;

  return { cleared, immunity, bank, kills, front };
}
