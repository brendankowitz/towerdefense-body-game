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
  /**
   * Cases cleared before the season offers this form, the same shape as `DefenderStats.unlock`.
   *
   * Growth used to be available from day one, which meant both of the game's forms were spent
   * before the player had met four of its six cells. Days 5 and 7 are the two days of the season
   * that add no cell and no rule, so they are where the forms belong: `defenders.ts` carries the
   * whole schedule and why it reads the way it does.
   */
  readonly unlock: number;
  readonly stats: Readonly<Partial<Record<MaturedStatField, number>>>;
}

/**
 * The macrophage, as four relationships to the phagocyte it grew from. Every stat it carries is one
 * of these times a base value and never a number of its own: the base has already moved once
 * without the form moving with it, and a grown cell that reached less far than the cell it grew
 * from shipped as a result. See `MATURED_FORMS`.
 *
 * `MACROPHAGE_APPETITE` does double duty. The long rest is what a full bank costs to clear, so a
 * cell with twice the bank takes twice as long over it — one idea, one number, two stats.
 */
const MACROPHAGE_APPETITE = 2;
const MACROPHAGE_REACH = 1.25;
const MACROPHAGE_BITE = 1.75;

/**
 * How much longer a macrophage takes between bodies, and the whole of what growing one gives up.
 * `MATURED_FORMS` carries the measurement that put it here — it is the one number in this file
 * that decides whether the form is a trade or a strict upgrade wearing a longer rest.
 */
const MACROPHAGE_PAUSE = 3;

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
 *   far slower between bodies.
 *
 *   **It is the answer to one heavy thing and the slow answer to a crowd**, and the pause is the
 *   only reason that is true. Its appetite, `MACROPHAGE_APPETITE` times the phagocyte's, is enough
 *   to swallow the heaviest body in the game whole and still have room, where the cell it grew from
 *   is filled by that one body and has to rest it off. But appetite, bite and reach all help it
 *   against a swarm as much as against a Resistant. The pause is the one stat that does not: it is
 *   charged once per *body*, so a stream of small ones pays it over and over and one Resistant pays
 *   it once.
 *
 *   Bodies fully digested per second by a grown cell against the cell it grew from, at saturation —
 *   one cell that is never short of prey, so none of this is geometry. Only the pause moves:
 *
 *   | pause        | Staph 26 | Virus 34 | Spore 60 | Biofilm 120 | Resistant 150 |
 *   |--------------|----------|----------|----------|-------------|---------------|
 *   | 1× (0.70s)   |    1.27× |    1.28× |    1.86× |       1.59× |         1.50× |
 *   | 2× (1.40s)   |    1.02× |    1.06× |    1.73× |       1.53× |         1.47× |
 *   | 2.5× (1.75s) |    0.92× |    0.98× |    1.67× |       1.53× |         1.43× |
 *   | 3× (2.10s)   |    0.85× |    0.90× |    1.62× |       1.53× |         1.43× |
 *
 *   The armoured columns barely move over the whole range while the small ones cross 1.0, which is
 *   what makes the pause a dial rather than a cliff — the opposite of reach (spec §5.0) and of the
 *   antibody's pulse below, and the reason the cost is spent here and nowhere else.
 *
 *   **The bolded sentence above used to sit here at a pause of 1×**, in the words "loses to a
 *   phagocyte on a stream of small ones" — top row of the table, where the macrophage was 27%
 *   faster through a stream of staph and faster through everything else besides. Better at every
 *   body in the game, for 55 energy, with a longer rest as the only thing it appeared to give up.
 *   The sentence was the design and the number was not, and the number is what the game ran. It is
 *   true now because `MACROPHAGE_PAUSE` makes it true. Note what it does *not* claim: growing every
 *   phagocyte still wins forearm boards on net, because reach and bite are real. The claim is about
 *   throughput per body, which is the table above.
 *
 *   Its reach is `MACROPHAGE_REACH` times the phagocyte's, and until 2026-07-26 it was the literal
 *   92 beside a comment stating it was 1.25× and *not written down independently*. 74 × 1.25 is
 *   92.5, so the comment was already half a unit wrong the day it was written; the tuning before
 *   that had left the same field at 70 against a base of 74, and growing a phagocyte cost it reach.
 *   Every value here is a relationship to a base stat, spelled as that relationship rather than
 *   asserted in prose beside a number — which is the only form of it a stale base cannot break.
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
 *
 * **The clot has no form, and that is a finding rather than an omission.** It had one — a fibrin
 * mesh that held harder and wore through faster — and it never worked. Every number a clot carries
 * is the same currency: total slowing delivered is hold strength × lifetime, lifetime is 1/wear, so
 * pricing `slow` against `wear` moves both ends of one quantity and lands back where it started.
 * Ten pricings over the whole board space of all three cases confirmed that, moving single digits
 * out of 3125 and 7776 boards and winning exactly zero throat boards every time.
 *
 * Reach was the one axis that was not that currency, and it was measured properly before the form
 * was removed. The clot reaches 76, and five of the season's fifteen build spots — throat 2, 3 and
 * 4, stomach 4, forearm 3 — need more than that before anything holds a body there for a second,
 * four of them 79–81. A mesh at 87.4 turns all five live: a real, spatial reason to grow one, and
 * the first pricing that ever converted a throat board. It still does not work, because reach is
 * not orthogonal either — wear is charged per body in range (decision D10), so a wider mesh catches
 * more bodies and is chewed through faster in proportion to the extra vessel it covers. Boards won
 * and lost over the whole season, growing only clots:
 *
 * | mesh                                            |  won | lost |
 * |-------------------------------------------------|------|------|
 * | as shipped: grip 0.28→0.16, wear 6→10, reach 76 |   +5 |  -23 |
 * | reach 76→87.4, giving up nothing at all         |  +12 |  -11 |
 * | reach 76→87.4, wear 6→9                         |  +10 |  -20 |
 * | reach 76→87.4, wear 6→12                        |  +11 |  -23 |
 *
 * The second row is the ceiling and it is a wash: a mesh that costs the player nothing but the
 * energy wins one board net out of 18 677, and every version that pays for its width with anything
 * at all loses. For scale, a strictly *favourable* 1–6% move on the macrophage's own stats swung one
 * case by 13 boards — so no row in that table carries a sign, let alone a design.
 *
 * A `MaturedForm` can only move numbers a defender already has, and the clot has three that touch
 * the fight. Grip and wear trade against each other exactly; reach buys more of both sides at once.
 * A form worth 80 energy would have to change what a clot *does*, which is a mechanic and not a
 * table entry, so there is no mesh — and the named exception that used to hold its place in
 * `maturation.sweep.ts` is gone with it. Two forms that work beat three that are excused.
 */
export const MATURED_FORMS: { readonly [K in DefenderKind]?: MaturedForm } = {
  phago: {
    name: 'Macrophage',
    cost: 55,
    unlock: 4,
    stats: {
      range: DEFENDERS.phago.range * MACROPHAGE_REACH,
      dps: DEFENDERS.phago.dps * MACROPHAGE_BITE,
      gap: DEFENDERS.phago.gap * MACROPHAGE_PAUSE,
      capacity: DEFENDERS.phago.capacity * MACROPHAGE_APPETITE,
      rest: DEFENDERS.phago.rest * MACROPHAGE_APPETITE,
    },
  },
  anti: {
    name: 'High-affinity antibody',
    cost: 110,
    unlock: 6,
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
