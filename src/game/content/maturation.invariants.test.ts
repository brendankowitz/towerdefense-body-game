import { describe, expect, it } from 'vitest';
import { DEFENDERS, DEFENDER_ORDER } from './defenders';
import { MATURED_FORMS, maturedFormOf } from './maturation';
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
