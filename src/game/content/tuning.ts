import { DEFENDERS, type DefenderStats } from './defenders';
import { PATHOGENS, type PathogenStats } from './pathogens';
import { CASES, type CaseDefinition, type WaveEntry } from './cases';
import type { CaseId, DefenderKind, PathogenKind } from '../types';

/**
 * Numeric fields of `T`, including optional ones (`Exclude<T[K], undefined>` unwraps the
 * `| undefined` an optional field like `PathogenStats.armour` carries). Non-numeric fields
 * — `kind`, `label`, `shape`, `token` and the like — are never assignable through this type,
 * so a caller cannot even attempt to tune a string field; `assertPatch` below is the runtime
 * half of the same guarantee for fields the type system cannot rule out per call site (see
 * `applyPathogenTuning`).
 */
type NumericKeys<T> = {
  [K in keyof T]-?: Exclude<T[K], undefined> extends number ? K : never;
}[keyof T] & string;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type MutableWaveEntry = Mutable<WaveEntry>;
type MutableCase = Omit<CaseDefinition, 'waves'> & { waves: MutableWaveEntry[][] };

// ── The one deliberately unsafe widening in this file ───────────────────────────────────────
// Content tables are `readonly` so every ordinary consumer — systems, screens, tests — treats
// them as frozen data (spec §4). The tuning panel is the one place permitted to mutate the
// live tables in place: three call sites below share this single cast pattern rather than each
// inventing its own escape hatch. Systems read `DEFENDERS`/`PATHOGENS`/`CASES` at call time, not
// at module load, so a mutation here takes effect on the very next simulation step with no
// plumbing between this module and the ones that read the tables.
const liveDefenders = DEFENDERS as { [K in DefenderKind]: Mutable<DefenderStats> };
const livePathogens = PATHOGENS as { [K in PathogenKind]: Mutable<PathogenStats> };
const liveCases = CASES as unknown as MutableCase[];
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * `structuredClone` is a DOM/worker global, unavailable under this file's DOM-free lib
 * (tsconfig.game.json). Content tables are plain JSON-safe data — no functions, no cycles —
 * so a JSON round-trip clones them exactly, including dropping an absent optional field
 * rather than carrying an explicit `undefined`, which matches the `field in target` check
 * `assertPatch` already relies on.
 */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const seedDefenders = deepClone(DEFENDERS);
const seedPathogens = deepClone(PATHOGENS);
const seedCases = deepClone(CASES);

function assertPatch(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [field, value] of Object.entries(patch)) {
    if (!(field in target) || typeof target[field] !== 'number') {
      throw new Error(`Unknown field for tuning: ${field}`);
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Tuning values must be finite numbers; got ${String(value)} for ${field}`);
    }
  }
}

/** Moves a defender stat against the live simulation. Rejects a field the kind does not carry. */
export function applyDefenderTuning<K extends DefenderKind>(
  kind: K,
  patch: Partial<Pick<(typeof DEFENDERS)[K], NumericKeys<(typeof DEFENDERS)[K]>>>,
): void {
  assertPatch(liveDefenders[kind], patch);
  Object.assign(liveDefenders[kind], patch);
}

/** Moves a pathogen stat against the live simulation. Rejects a field the kind does not carry. */
export function applyPathogenTuning(
  kind: PathogenKind,
  patch: Partial<Pick<PathogenStats, NumericKeys<PathogenStats>>>,
): void {
  assertPatch(livePathogens[kind], patch);
  Object.assign(livePathogens[kind], patch);
}

/**
 * Moves a wave's per-kind spawn count against the live simulation. Only counts for a kind the
 * wave already lists can move — adding a kind a wave never had is level design, not tuning
 * (spec §4.1 excludes geometry editing for the same reason).
 */
export function applyWaveTuning(caseId: CaseId, waveIndex: number, kind: PathogenKind, count: number): void {
  const target = liveCases.find((c) => c.id === caseId);
  if (target === undefined) throw new Error(`Unknown case for tuning: ${caseId}`);

  const wave = target.waves[waveIndex];
  if (wave === undefined) throw new Error(`Unknown wave index for tuning: ${caseId} wave ${String(waveIndex)}`);

  const entry = wave.find((e) => e.kind === kind);
  if (entry === undefined) {
    throw new Error(`Wave ${String(waveIndex)} of ${caseId} has no ${kind} entry to tune`);
  }
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`Tuning wave counts must be non-negative integers; got ${String(count)}`);
  }

  entry.count = count;

}

/** Restores every seed value across defenders, pathogens and case wave tables. */
export function resetTuning(): void {
  for (const kind of Object.keys(liveDefenders) as DefenderKind[]) {
    Object.assign(liveDefenders[kind], seedDefenders[kind]);
  }
  for (const kind of Object.keys(livePathogens) as PathogenKind[]) {
    Object.assign(livePathogens[kind], seedPathogens[kind]);
  }
  liveCases.forEach((liveCase, caseIndex) => {
    const seedCase = seedCases[caseIndex];
    if (seedCase === undefined) return;
    liveCase.waves.forEach((wave, waveIndex) => {
      const seedWave = seedCase.waves[waveIndex];
      wave.forEach((entry, entryIndex) => {
        const seedEntry = seedWave?.[entryIndex];
        if (seedEntry !== undefined) entry.count = seedEntry.count;
      });
    });
  });
}

export interface TunableField {
  readonly group: 'defender' | 'pathogen';
  readonly kind: string;
  readonly field: string;
  readonly value: number;
}

/** Every numeric field of every defender and pathogen, for the panel to render as a row. */
export function listTunables(): readonly TunableField[] {
  const fields: TunableField[] = [];
  for (const [kind, stats] of Object.entries(DEFENDERS)) {
    for (const [field, value] of Object.entries(stats)) {
      if (typeof value === 'number') fields.push({ group: 'defender', kind, field, value });
    }
  }
  for (const [kind, stats] of Object.entries(PATHOGENS)) {
    for (const [field, value] of Object.entries(stats)) {
      if (typeof value === 'number') fields.push({ group: 'pathogen', kind, field, value });
    }
  }
  return fields;
}

/**
 * Recurses, though nothing exported today is nested: the defender and pathogen tables are
 * deliberately flat, and `maturation.invariants.test.ts` asserts they stay that way. This
 * exists because falling through to String() emits the literal text "[object Object]" into
 * source a developer is meant to paste over a const — a silent corruption rather than a
 * failure. Cheap insurance for the day a nested table becomes tunable.
 */
function literal(value: unknown): string {
  if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`;
  if (Array.isArray(value)) return `[${value.map(literal).join(', ')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{ ${entrySource(Object.entries(value))} }`;
  }
  return String(value);
}

function entrySource(entries: readonly (readonly [string, unknown])[]): string {
  return entries.map(([field, value]) => `${field}: ${literal(value)}`).join(', ');
}

/**
 * Regenerates the table body of `defenders.ts` and `pathogens.ts` from the live values. The
 * developer pastes the entries over the corresponding `export const` in the file itself,
 * keeping its imports, types and comments intact — a tuning session becomes a reviewable
 * `git diff` against `content/`, not a JSON blob (spec §4.1). Wave composition is tunable
 * live but is not exported: `cases.ts` carries prose and path geometry alongside its wave
 * tables, so regenerating it faithfully is a level-editor problem the panel deliberately
 * does not take on (YAGNI).
 */
export function exportContentModules(): { readonly defenders: string; readonly pathogens: string } {
  const defenderEntries = Object.entries(DEFENDERS)
    .map(([kind, stats]) => `  ${kind}: { ${entrySource(Object.entries(stats))} },`)
    .join('\n');
  const pathogenEntries = Object.entries(PATHOGENS)
    .map(([kind, stats]) => `  ${kind}: { ${entrySource(Object.entries(stats))} },`)
    .join('\n');

  return {
    defenders: `export const DEFENDERS = {\n${defenderEntries}\n};\n`,
    pathogens: `export const PATHOGENS = {\n${pathogenEntries}\n};\n`,
  };
}
