import type { DefenderKind } from '../types';

/**
 * What a placed cell can be grown into during a build phase.
 *
 * Kept beside the defender table rather than inside it, for the same reason `rules.ts` sits
 * beside the entity tables: maturation is its own concept, not a property of a cell's base
 * stats. It also leaves `DEFENDERS` entries flat, which the tuning panel's content exporter
 * depends on — it renders every entry field with `String(value)`, so a nested object there
 * would emit `[object Object]` into source a developer is meant to paste back.
 *
 * A matured cell keeps its kind. A macrophage is a matured monocyte, same lineage, so this
 * table describes a tier on an existing defender and never a seventh defender.
 */

/**
 * Every numeric stat a matured form is allowed to move. Listed rather than derived from the
 * defender branch it applies to, because those branches are written inline in `DEFENDERS` and
 * naming them would mean restructuring a table three other modules read. An override naming a
 * stat its defender does not carry is caught structurally by `maturation.invariants.test.ts`.
 *
 * `dot` is deliberately absent. The tag burn is applied per enemy in `applyMovement`, which
 * cannot know which antibody laid the mark, so an override there would be a number the
 * simulation never honours.
 */
type MaturedStatField =
  | 'range' | 'dps' | 'gap' | 'streak' | 'rest' | 'slow' | 'wear'
  | 'rate' | 'tag' | 'dmg' | 'execute' | 'learn' | 'cap';

export interface MaturedForm {
  readonly name: string;
  /** Energy to grow the cell, on top of what its placement already cost. */
  readonly cost: number;
  readonly stats: Readonly<Partial<Record<MaturedStatField, number>>>;
}

/**
 * A monocyte that has settled into tissue becomes a macrophage: bigger, hungrier, longer
 * reach. It is also slower to come back — the trade is burst and single-target bite against
 * sustained throughput, so a macrophage beats a phagocyte on one armoured thing and loses to
 * it on a stream of small ones.
 */
const MACROPHAGE: MaturedForm = {
  name: 'Macrophage', cost: 55, stats: { range: 70, dps: 26, rest: 7.2 },
};

/**
 * Fibrin cross-links a soft platelet plug into a firm one: it holds far harder, and it is
 * consumed faster for it. Wear is per body (decision D10), so a fibrin mesh in a busy lane
 * buys a long hold and then fails outright.
 */
const FIBRIN_MESH: MaturedForm = {
  name: 'Fibrin mesh', cost: 80, stats: { slow: 0.16, wear: 21 },
};

/**
 * Affinity maturation: the antibody binds one target far better and everything else rather
 * worse. Marks last half again as long, over a visibly narrower field, and re-marking a fresh
 * crowd takes twice as long.
 */
const HIGH_AFFINITY: MaturedForm = {
  name: 'High-affinity antibody', cost: 110, stats: { range: 78, rate: 3, tag: 9 },
};

/**
 * Absent for most of the dock, and deliberately so: a form is listed only where the real
 * immunology names one, per the content naming policy. A cell with no entry here is simply
 * as grown as it gets.
 */
export const MATURED_FORMS: { readonly [K in DefenderKind]?: MaturedForm } = {
  phago: MACROPHAGE,
  clot: FIBRIN_MESH,
  anti: HIGH_AFFINITY,
};

/** The form this kind can be grown into. Null rather than undefined, stated once, here. */
export function maturedFormOf(kind: DefenderKind): MaturedForm | null {
  return MATURED_FORMS[kind] ?? null;
}
