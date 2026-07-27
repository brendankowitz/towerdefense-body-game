import { DEFENDERS } from './defenders';
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
 * Every numeric stat a matured form is allowed to move, and the order the offer reads them in.
 * A list with the union derived from it rather than the other way around, so `maturedChanges`
 * can walk the fields without asserting that a string key is one of them.
 *
 * Listed rather than derived from the defender branch it applies to, because those branches are
 * written inline in `DEFENDERS` and naming them would mean restructuring a table three other
 * modules read. An override naming a
 * stat its defender does not carry is caught structurally by `maturation.invariants.test.ts`,
 * and at runtime by `applyMaturationTuning` — the type alone cannot rule it out, because it is
 * one union for six kinds rather than a branch per kind.
 *
 * `dot` is deliberately absent. The tag burn is applied per enemy in `applyMovement`, which
 * cannot know which antibody laid the mark, so an override there would be a number the
 * simulation never honours.
 */
export const MATURED_STAT_FIELDS = [
  'range', 'dps', 'gap', 'capacity', 'rest', 'slow', 'wear',
  'rate', 'tag', 'dmg', 'execute', 'learn', 'cap',
] as const;

export type MaturedStatField = (typeof MATURED_STAT_FIELDS)[number];

export interface MaturedForm {
  readonly name: string;
  /** Energy to grow the cell, on top of what its placement already cost. */
  readonly cost: number;
  readonly stats: Readonly<Partial<Record<MaturedStatField, number>>>;
}

/** How much more a macrophage holds than the phagocyte it grew from. See `MATURED_FORMS`. */
const MACROPHAGE_APPETITE = 2;

/**
 * The high-affinity antibody's two dials: its mark holds `HIGH_AFFINITY_GRIP` times as long, and
 * it takes `HIGH_AFFINITY_PULSE` times as long to lay the next one. Deliberately not the same
 * number, and the smaller one is the cost — see `MATURED_FORMS` for why the pulse is priced so
 * much more carefully than the grip.
 */
const HIGH_AFFINITY_GRIP = 1.5;
const HIGH_AFFINITY_PULSE = 1.2;

/**
 * A form is listed only where the real immunology names one, per the content naming policy. A
 * cell with no entry here is simply as grown as it gets, which is most of the dock.
 *
 * Written as one flat table rather than three named consts so the tuning panel's exporter can
 * regenerate it verbatim — the exporter knows the kind each form belongs to and has no way to
 * know what a const holding it was called.
 *
 * - **Macrophage.** A monocyte that has settled into tissue: bigger, hungrier, longer reach, and
 *   slower to come back. The trade is burst and single-target bite against sustained throughput,
 *   so a macrophage beats a phagocyte on one armoured thing and loses to it on a stream of small
 *   ones.
 *
 *   Its appetite is the point of growing one. `MACROPHAGE_APPETITE` is written as a multiple of
 *   the phagocyte's own capacity rather than as a number, so the relationship survives a balance
 *   pass on the base. At the 2× it carries today that is enough to swallow the heaviest body in
 *   the game whole and still have room, where the cell it grew from is filled by that one body
 *   and has to rest it off — which is what makes the macrophage the answer to a Resistant and
 *   leaves the base phagocyte, at less than half the energy, the answer to a stream of small ones.
 *
 *   Its reach is derived from the phagocyte's, at 1.25×, and not written down independently. The
 *   2026-07-26 tuning raised the base from 56 to 74 and left this at its literal 70, which turned
 *   the cell's signature upgrade into a downgrade — growing a phagocyte cost it reach. Every
 *   value here is a relationship to a base stat; when the base moves, re-derive rather than
 *   re-check that the number still looks sensible. Capacity is spelled as that relationship
 *   instead of a comment about one, which is the only form of it a stale base cannot break.
 * - **Fibrin mesh.** Fibrin cross-links a soft platelet plug into a firm one: it holds far
 *   harder, and it is consumed faster for it. Wear is per body (decision D10), so a mesh in a
 *   busy lane buys a long hold and then fails outright.
 *
 *   **This form does not work, and it is not a tuning problem.** Its gain and its cost are the
 *   same quantity: total slowing delivered is hold strength × lifetime, and lifetime is 1/wear, so
 *   trading `slow` against `wear` moves one number up and the other down by the same amount and
 *   the mesh comes out where it started. Measured, ten pricings across the whole board space of
 *   all three cases moved single digits out of 3125 and 7776 boards, and every one of them won
 *   exactly zero boards on throat. Reach is the only axis that broke the tie.
 *
 *   Recorded as a named exception in `maturation.sweep.ts` rather than tuned until a number went
 *   green, and left for a design pass. Nothing here should be nudged in the meantime: with the two
 *   knobs cancelling, any movement is noise, and choosing the pricing that happened to measure
 *   well is how the antibody's reach literal below got written in the first place.
 * - **High-affinity antibody.** Affinity maturation: the same cell, selected until what it makes
 *   binds far harder. The mark holds `HIGH_AFFINITY_GRIP` times as long — long enough that it
 *   outlives the stretch of vessel the cell can see, and travels on with the body — and the cell
 *   waits `HIGH_AFFINITY_PULSE` times as long before it can lay the next one.
 *
 *   That is the whole trade, and it is a trade about *density*. A longer mark is worth most where
 *   bodies are few and hard: it keeps armour off and the burn running after the body has walked
 *   out of reach. A slower pulse costs most where bodies are many: the cell marks a crowd, and
 *   everything that arrives in the gap crosses the vessel unmarked. Measured over the whole board
 *   space by `maturation.sweep.ts`, growing every antibody wins 193 boards on forearm and 623 on
 *   stomach, and loses 18, 68 and 69 of them across the three cases — the 69 on throat, whose rule
 *   splits every dead virus into two more and which is therefore the densest stream in the season.
 *   Both halves are boards, not rounding.
 *
 *   **The pulse is a cliff, the way reach is** (spec §5.0), and a tuning must treat it as one.
 *   Moving only the pulse and leaving everything else alone, measured over throat's whole board
 *   space against the 486 boards it can win at all:
 *
 *   | pulse | 1.0× (1.50s) | 1.2× (1.80s) | 1.33× (2.00s) | 1.5× (2.25s) |
 *   |-------|--------------|--------------|---------------|--------------|
 *   | lost  |            0 |           69 |           106 |          124 |
 *
 *   Three tenths of a second is 69 boards. Those losses are the same at a grip of 1.5× and at 2×,
 *   which is how we know the cost is the pulse and not the mark.
 *
 *   **This form has no gentle downside available, and that is a constraint on it rather than an
 *   oversight.** Its three stats are reach, mark and pulse. Reach may not fall — see below. The
 *   mark is the gain, and on its own it is a strict upgrade: at pulse 1.0× it wins 39 of throat's
 *   boards and loses none, which `maturation.invariants.test.ts` refuses. That leaves the pulse
 *   carrying the whole cost, on a cliff. Anyone retuning this should expect the throat number to
 *   move much faster than the change looks, and should not reach for reach.
 *
 *   It does not trade reach, and this is the rule the whole table answers to: **a matured form may
 *   never drop a cell below the dwell floor at a spot its base form was above.** Reach is the
 *   dominant stat in this game. Every defender's range sits in a narrow band just above the
 *   offsets the build spots are laid at, so a form that trims a few units does not cover slightly
 *   less vessel — it falls off a cliff and covers none. This form used to hand back 94 for 78,
 *   which read as a modest narrowing and was in fact a cell that could not hold a second of vessel
 *   from four of the season's fifteen spots — at throat's spot 3 the 5.30 seconds the base cell
 *   gets became none at all. It grew into a cell that stood there marking nothing, for 110 energy,
 *   and nothing said so. The rule is asserted per spot against the real geometry in
 *   `content.invariants.test.ts`.
 */
export const MATURED_FORMS: { readonly [K in DefenderKind]?: MaturedForm } = {
  phago: {
    name: 'Macrophage',
    cost: 55,
    stats: {
      range: 92,
      dps: 26,
      capacity: DEFENDERS.phago.capacity * MACROPHAGE_APPETITE,
      rest: 7.2,
    },
  },
  clot: { name: 'Fibrin mesh', cost: 80, stats: { slow: 0.16, wear: 10 } },
  anti: {
    name: 'High-affinity antibody',
    cost: 110,
    stats: {
      rate: DEFENDERS.anti.rate * HIGH_AFFINITY_PULSE,
      tag: DEFENDERS.anti.tag * HIGH_AFFINITY_GRIP,
    },
  },
};

/** The form this kind can be grown into. Null rather than undefined, stated once, here. */
export function maturedFormOf(kind: DefenderKind): MaturedForm | null {
  return MATURED_FORMS[kind] ?? null;
}

/**
 * How a stat reads on the offer.
 *
 * `unit` is how the number is spelled, not what it means: `seconds` for a duration, `perSecond`
 * for a rate of damage or decay, `share` for a fraction the player reads as a percentage, and
 * `plain` for a bare quantity. `betterWhenHigher` is the design's own vocabulary — `rate` is a
 * cooldown so lower fires more often, `slow` is a speed multiplier so lower is a stronger hold,
 * `wear` and `rest` are costs. `maturation.invariants.test.ts` records that polarity a second
 * time, independently, and asserts the two agree: a form's whole claim to being a trade rests on
 * which way each stat counts, and one table stating it is one table to get quietly wrong.
 */
interface StatWording {
  readonly label: string;
  readonly unit: 'seconds' | 'perSecond' | 'share' | 'plain';
  readonly betterWhenHigher: boolean;
}

/**
 * Written as a total record so a stat a form is allowed to move cannot be one the offer has no
 * words for — the compiler asks for the entry rather than the screen silently omitting a line
 * the player is being charged for.
 */
export const MATURED_STAT_WORDING: Readonly<Record<MaturedStatField, StatWording>> = {
  range: { label: 'Reach', unit: 'plain', betterWhenHigher: true },
  dps: { label: 'Bite', unit: 'perSecond', betterWhenHigher: true },
  gap: { label: 'Pause', unit: 'seconds', betterWhenHigher: false },
  capacity: { label: 'Appetite', unit: 'plain', betterWhenHigher: true },
  rest: { label: 'Rest', unit: 'seconds', betterWhenHigher: false },
  slow: { label: 'Crawl', unit: 'share', betterWhenHigher: false },
  wear: { label: 'Wear', unit: 'perSecond', betterWhenHigher: false },
  rate: { label: 'Pulse', unit: 'seconds', betterWhenHigher: false },
  tag: { label: 'Mark', unit: 'seconds', betterWhenHigher: true },
  dmg: { label: 'Hit', unit: 'plain', betterWhenHigher: true },
  execute: { label: 'Finish', unit: 'share', betterWhenHigher: true },
  learn: { label: 'Learn', unit: 'plain', betterWhenHigher: true },
  cap: { label: 'Ceiling', unit: 'plain', betterWhenHigher: true },
};

/** One stat a form moves, spelled for the offer the player is deciding on. */
export interface MaturedChange {
  readonly field: MaturedStatField;
  readonly label: string;
  readonly from: string;
  readonly to: string;
  /** True when the change is in the player's favour. */
  readonly gain: boolean;
}

/**
 * Trailing zeros dropped, and never more than two decimals. A stat written as a multiple of a
 * base one rarely lands on a whole number, and a float multiply lands beside it: the pulse below
 * is 1.5 × 1.2, which is 1.7999999999999998 and reads as 1.8.
 */
function spell(value: number, unit: StatWording['unit']): string {
  if (unit === 'share') return `${String(Math.round(value * 100))}%`;
  const number = String(Number(value.toFixed(2)));
  if (unit === 'seconds') return `${number}s`;
  if (unit === 'perSecond') return `${number}/s`;
  return number;
}

/**
 * What growing this cell would change, in `MATURED_STAT_FIELDS` order rather than in whatever
 * order the form's own object literal happens to be written in — so a stat does not move up and
 * down the offer because someone reordered a table.
 *
 * The offer used to be a name and a price, and a matured form is a trade — the player was being
 * asked to spend most of another cell on a decision they could not see either side of. Every
 * number here comes off the two tables the simulation itself reads, so a tuning moves the offer
 * and cannot leave it quoting a stat that no longer exists.
 *
 * Empty for a kind with no form, which is how the screen asks whether there is anything to show.
 */
export function maturedChanges(kind: DefenderKind): readonly MaturedChange[] {
  const form = maturedFormOf(kind);
  if (form === null) return [];

  const base: Readonly<Record<string, unknown>> = { ...DEFENDERS[kind] };
  const changes: MaturedChange[] = [];
  for (const field of MATURED_STAT_FIELDS) {
    const value = form.stats[field];
    const was = base[field];
    if (value === undefined || typeof was !== 'number') continue;

    const wording = MATURED_STAT_WORDING[field];
    changes.push({
      field,
      label: wording.label,
      from: spell(was, wording.unit),
      to: spell(value, wording.unit),
      gain: (value > was) === wording.betterWhenHigher,
    });
  }
  return changes;
}
