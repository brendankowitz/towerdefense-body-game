import { DEFENDERS, type DefenderStats } from './defenders';
import { MATURED_FORMS, type MaturedStatField } from './maturation';
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

/** `Mutable<MaturedForm>` would still leave `stats` readonly inside, so it is spelled out. */
interface MutableMaturedForm {
  name: string;
  cost: number;
  stats: Partial<Record<MaturedStatField, number>>;
}

/**
 * Everything a matured form carries that a balance pass can move: the stats it overrides, plus
 * `cost`, the energy the growth itself charges. `name` is copy, not balance.
 */
export type MaturationField = 'cost' | MaturedStatField;

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
const liveMaturation = MATURED_FORMS as { [K in DefenderKind]?: MutableMaturedForm };
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
const seedMaturation = deepClone(MATURED_FORMS);

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

/**
 * Moves a matured form's stat against the live simulation. `statsFor` merges these *on top of*
 * the defender table, so without this every stat a matured form names — the macrophage's reach,
 * the fibrin mesh's wear, the high-affinity antibody's mark — was frozen against the panel: set
 * `phago.dps` to 999 and the macrophage still bit for 26.
 *
 * The type cannot express "a field this kind carries": `MaturedForm.stats` is one flat union of
 * every stat any defender has, not a branch per kind, so `{ dps: 1 }` on the clot's form type-checks.
 * This is the runtime half of that guarantee, and it checks against the *base* entry rather than
 * against the fields the form already overrides — a form may start overriding a stat it did not
 * before, but only ever one its own defender actually fights with.
 *
 * Both loops run before anything is written, so a rejected patch leaves the form untouched.
 */
export function applyMaturationTuning(
  kind: DefenderKind,
  patch: Readonly<Partial<Record<MaturationField, number>>>,
): void {
  const form = liveMaturation[kind];
  if (form === undefined) throw new Error(`Unknown matured form for tuning: ${kind} has none`);

  const base = DEFENDERS[kind] as unknown as Record<string, unknown>;
  for (const [field, value] of Object.entries(patch)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Tuning values must be finite numbers; got ${String(value)} for ${field}`);
    }
    if (field !== 'cost' && typeof base[field] !== 'number') {
      throw new Error(`Unknown field for tuning: ${kind} has no ${field} for its matured form to override`);
    }
  }

  const { cost, ...stats } = patch;
  if (cost !== undefined) form.cost = cost;
  Object.assign(form.stats, stats);
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

/** Restores every seed value across defenders, matured forms, pathogens and case wave tables. */
export function resetTuning(): void {
  for (const kind of Object.keys(liveDefenders) as DefenderKind[]) {
    Object.assign(liveDefenders[kind], seedDefenders[kind]);
  }
  for (const kind of Object.keys(liveMaturation) as DefenderKind[]) {
    const live = liveMaturation[kind];
    const seed = seedMaturation[kind];
    if (live === undefined || seed === undefined) continue;
    live.cost = seed.cost;
    // Replaced rather than merged: a patch may have added an override the seed never had, and
    // merging would leave it behind. `statsFor` reads `form.stats` at call time, so swapping the
    // object is felt on the next step exactly as a field write is.
    live.stats = deepClone(seed.stats);
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
  readonly group: 'defender' | 'maturation' | 'pathogen';
  readonly kind: string;
  readonly field: string;
  readonly value: number;
}

/**
 * Every numeric field of every defender, matured form and pathogen, for the panel to render as
 * a row. A matured form lists only the stats it overrides, plus its growth cost: everything else
 * a grown cell fights with comes from the base table, which is the row above.
 */
export function listTunables(): readonly TunableField[] {
  const fields: TunableField[] = [];
  for (const [kind, stats] of Object.entries(DEFENDERS)) {
    for (const [field, value] of Object.entries(stats)) {
      if (typeof value === 'number') fields.push({ group: 'defender', kind, field, value });
    }
  }
  for (const [kind, form] of Object.entries(MATURED_FORMS)) {
    fields.push({ group: 'maturation', kind, field: 'cost', value: form.cost });
    for (const [field, value] of Object.entries(form.stats)) {
      if (typeof value === 'number') fields.push({ group: 'maturation', kind, field, value });
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
 * Recurses, because the maturation table is nested: a form holds its overrides in a `stats`
 * object. The defender and pathogen tables are still deliberately flat, and
 * `maturation.invariants.test.ts` asserts they stay that way. Falling through to String() would
 * emit the literal text "[object Object]" into source a developer is meant to paste over a
 * const — a silent corruption rather than a failure.
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
 * Regenerates the table body of `defenders.ts`, `maturation.ts` and `pathogens.ts` from the live
 * values. The developer pastes the entries over the corresponding `export const` in the file
 * itself, keeping its imports, types and comments intact — a tuning session becomes a reviewable
 * `git diff` against `content/`, not a JSON blob (spec §4.1). Wave composition is tunable
 * live but is not exported: `cases.ts` carries prose and path geometry alongside its wave
 * tables, so regenerating it faithfully is a level-editor problem the panel deliberately
 * does not take on (YAGNI).
 *
 * The maturation body carries its type annotation and the other two do not, because the
 * maturation table is emitted whole — its entries are optional, so the annotation is what tells
 * the compiler that a missing kind is legal rather than an error.
 */
export function exportContentModules(): {
  readonly defenders: string;
  readonly maturation: string;
  readonly pathogens: string;
} {
  const defenderEntries = Object.entries(DEFENDERS)
    .map(([kind, stats]) => `  ${kind}: { ${entrySource(Object.entries(stats))} },`)
    .join('\n');
  const maturationEntries = Object.entries(MATURED_FORMS)
    .map(([kind, form]) => `  ${kind}: ${literal(form)},`)
    .join('\n');
  const pathogenEntries = Object.entries(PATHOGENS)
    .map(([kind, stats]) => `  ${kind}: { ${entrySource(Object.entries(stats))} },`)
    .join('\n');

  return {
    defenders: `export const DEFENDERS = {\n${defenderEntries}\n};\n`,
    maturation:
      'export const MATURED_FORMS: { readonly [K in DefenderKind]?: MaturedForm } = {\n'
      + `${maturationEntries}\n};\n`,
    pathogens: `export const PATHOGENS = {\n${pathogenEntries}\n};\n`,
  };
}
