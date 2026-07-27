import { describe, expect, it } from 'vitest';
import { DEFENDERS, DEFENDER_ORDER } from './defenders';
import {
  MATURED_FORMS, MATURED_STAT_FIELDS, MATURED_STAT_WORDING, maturedChanges, maturedFormOf,
} from './maturation';
import type { DefenderKind } from '../types';

// Structural invariants over the matured forms, never their values. A balance pass must be
// able to move every number here without turning this suite red (spec §4, §9) — what it must
// not be able to do is turn a matured form into a free upgrade, which is a design rule and is
// asserted below.

const GROWN = DEFENDER_ORDER.filter((kind) => maturedFormOf(kind) !== null);

/**
 * Which way is up for each stat a matured form may move. This is the design's own vocabulary,
 * not a balance figure: `dps` higher is better, `rest` higher is worse, `slow` is a speed
 * multiplier so lower is a stronger hold, `rate` is a cooldown so lower fires more often,
 * `wear` is self-damage so lower lasts longer.
 */
const BETTER_WHEN_HIGHER: Readonly<Record<string, boolean>> = {
  range: true, dps: true, capacity: true, tag: true, dmg: true, execute: true, learn: true, cap: true,
  gap: false, rest: false, slow: false, wear: false, rate: false,
};

/** The base stats of a kind, string-keyed. Spread rather than cast, as `content.invariants` does. */
function baseStats(kind: DefenderKind): Record<string, unknown> {
  return { ...DEFENDERS[kind] };
}

describe('matured forms', () => {
  it('gives at least one defender a matured form, so the rules below have something to check', () => {
    expect(GROWN.length).toBeGreaterThan(0);
  });

  it('names a defender that exists for every form it lists', () => {
    for (const kind of Object.keys(MATURED_FORMS)) {
      expect(DEFENDER_ORDER, `${kind} has a matured form but is not a defender`).toContain(kind);
    }
  });

  it('only overrides stats the base entry actually carries', () => {
    for (const kind of GROWN) {
      const base = baseStats(kind);
      const form = maturedFormOf(kind);
      if (form === null) continue;

      for (const field of Object.keys(form.stats)) {
        expect(
          typeof base[field],
          `${kind}'s matured form moves ${field}, which is not a stat ${kind} has`,
        ).toBe('number');
      }
    }
  });

  it('actually moves the stat it overrides', () => {
    for (const kind of GROWN) {
      const base = baseStats(kind);
      const form = maturedFormOf(kind);
      if (form === null) continue;

      for (const [field, value] of Object.entries(form.stats)) {
        expect(value, `${kind}'s matured ${field} restates the base value`).not.toBe(base[field]);
      }
    }
  });

  /**
   * The one rule worth the most here. A form that only improves things makes maturing the
   * obvious answer every time, which deletes the decision the mechanic exists to create.
   */
  it('is a trade, never a strict upgrade — every form gives something up', () => {
    for (const kind of GROWN) {
      const base = baseStats(kind);
      const form = maturedFormOf(kind);
      if (form === null) continue;

      let better = 0;
      let worse = 0;
      for (const [field, value] of Object.entries(form.stats)) {
        const was = base[field];
        const higherIsBetter = BETTER_WHEN_HIGHER[field];
        expect(typeof was, `${kind} has no base ${field}`).toBe('number');
        expect(higherIsBetter, `no polarity recorded for ${field}`).toBeDefined();
        if (typeof was !== 'number' || higherIsBetter === undefined) continue;

        if ((value > was) === higherIsBetter) better += 1;
        else worse += 1;
      }

      expect(better, `${kind}'s matured form improves nothing`).toBeGreaterThan(0);
      expect(worse, `${kind}'s matured form costs nothing — it is a strict upgrade`).toBeGreaterThan(0);
    }
  });

  /**
   * The offer the player reads carries its own copy of which way each stat counts, because the
   * screen has to say whether a longer pulse is something the growth gains or something it gives
   * up. Two tables state that, written independently and on purpose — a single one is a single
   * thing to get quietly wrong, and getting it wrong prints the trade backwards.
   */
  it('agrees with the offer copy on which way every stat counts', () => {
    for (const field of MATURED_STAT_FIELDS) {
      expect(
        MATURED_STAT_WORDING[field].betterWhenHigher,
        `this suite and the offer copy disagree on whether a higher ${field} is better`,
      ).toBe(BETTER_WHEN_HIGHER[field]);
      expect(MATURED_STAT_WORDING[field].label.length, `${field} has no word on the offer`)
        .toBeGreaterThan(0);
    }
  });

  /**
   * What the screen shows against what the table holds. The offer is the only place the player
   * ever sees either side of a trade, so a form that moves a stat the offer omits is a cost or a
   * gain being charged for silently — which is the state this whole mechanic shipped in.
   */
  it('puts every stat a form moves on the offer, on the right side of the trade', () => {
    for (const kind of GROWN) {
      const form = maturedFormOf(kind);
      if (form === null) continue;

      const base = baseStats(kind);
      const changes = maturedChanges(kind);
      expect(
        changes.map((change) => change.field).sort(),
        `${kind}'s offer does not list the same stats its form moves`,
      ).toEqual(Object.keys(form.stats).sort());

      for (const change of changes) {
        const was = base[change.field];
        const now = form.stats[change.field];
        expect(typeof was).toBe('number');
        expect(typeof now).toBe('number');
        if (typeof was !== 'number' || now === undefined) continue;

        expect(
          change.gain,
          `${kind}'s offer puts ${change.field} on the wrong side: ${String(was)} becomes ${String(now)}`,
        ).toBe((now > was) === BETTER_WHEN_HIGHER[change.field]);
      }
    }
  });

  /**
   * The numbers on the offer are spelled, not printed — trailing zeros dropped, fractions shown
   * as percentages — so they can round. Asserted as a relation rather than as a string, because a
   * string is the formatter restated: what matters is that the two values still read as different
   * numbers, and in the direction the stats actually move.
   */
  it('spells the two sides of every change so they still read apart, and the right way round', () => {
    const digits = (spelled: string): number => Number(spelled.replace(/[^0-9.]/g, ''));

    for (const kind of GROWN) {
      const form = maturedFormOf(kind);
      if (form === null) continue;

      const base = baseStats(kind);
      for (const change of maturedChanges(kind)) {
        const was = base[change.field];
        const now = form.stats[change.field];
        if (typeof was !== 'number' || now === undefined) continue;

        expect(change.from, `${kind}'s ${change.field} reads the same on both sides of the offer`)
          .not.toBe(change.to);
        expect(
          digits(change.to) > digits(change.from),
          `${kind}'s ${change.field} goes ${String(was)} to ${String(now)} and reads ${change.from} to ${change.to}`,
        ).toBe(now > was);
      }
    }
  });

  it('shows nothing for a cell that has nowhere left to grow', () => {
    for (const kind of DEFENDER_ORDER) {
      if (maturedFormOf(kind) !== null) continue;
      expect(maturedChanges(kind)).toEqual([]);
    }
  });

  it('charges energy to grow, so maturing competes with placing', () => {
    for (const kind of GROWN) {
      expect(maturedFormOf(kind)?.cost).toBeGreaterThan(0);
    }
  });

  it('names every form, and never exclaims or uses an emoji — spec copy rules', () => {
    for (const kind of GROWN) {
      const name = maturedFormOf(kind)?.name ?? '';
      expect(name.length).toBeGreaterThan(0);
      expect(name).not.toContain('!');
      expect(name).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  /**
   * The exporter in `tuning.ts` renders every `DEFENDERS` field with `String(value)`, so a
   * nested object inside an entry would emit `[object Object]` into source a developer is meant
   * to paste back over the const. That is why this table lives in its own module, and this is
   * the assertion that keeps it there.
   */
  it('leaves the defender table flat, which the content exporter depends on', () => {
    for (const kind of DEFENDER_ORDER) {
      for (const [field, value] of Object.entries(baseStats(kind))) {
        expect(
          typeof value,
          `DEFENDERS.${kind}.${field} is an object; the content exporter cannot render it`,
        ).not.toBe('object');
      }
    }
  });
});
