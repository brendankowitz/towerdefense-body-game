import { describe, expect, it } from 'vitest';
import { maturationOffer, statsFor } from './stats';
import { DEFENDERS, DEFENDER_ORDER } from '../content/defenders';
import { maturedFormOf } from '../content/maturation';
import type { DefenderKind } from '../types';

const GROWN = DEFENDER_ORDER.filter((kind) => maturedFormOf(kind) !== null);
const PLAIN = DEFENDER_ORDER.filter((kind) => maturedFormOf(kind) === null);

/**
 * Field-by-field reads over a stat block. Spread into a string-keyed shape rather than cast,
 * which is the idiom `content.invariants.test.ts` already uses for the same problem.
 */
function statMap(kind: DefenderKind, matured: boolean): Record<string, unknown> {
  return { ...statsFor({ kind, matured }) };
}

function numericFields(kind: DefenderKind): readonly string[] {
  const map = statMap(kind, false);
  return Object.keys(map).filter((field) => typeof map[field] === 'number');
}

describe('statsFor', () => {
  it('has both a defender with a matured form and one without, or the cases below are vacuous', () => {
    expect(GROWN.length).toBeGreaterThan(0);
    expect(PLAIN.length).toBeGreaterThan(0);
  });

  /**
   * The guarantee the whole per-tower refactor rests on: routing every damage path through
   * `statsFor` must leave an unmatured cell reading exactly what the module table said before.
   * Asserted by identity as well as by value — the base tier merges nothing and allocates
   * nothing, so it is the very same object the systems used to hold directly.
   */
  it('reads the base table, unchanged, for a cell that has not been grown', () => {
    for (const kind of DEFENDER_ORDER) {
      expect(statsFor({ kind, matured: false })).toEqual(DEFENDERS[kind]);
      expect(statsFor({ kind, matured: false })).toBe(DEFENDERS[kind]);
    }
  });

  it('applies every stat the matured form overrides', () => {
    for (const kind of GROWN) {
      const form = maturedFormOf(kind);
      if (form === null) continue;

      const grown = statMap(kind, true);
      for (const [field, value] of Object.entries(form.stats)) {
        expect(grown[field], `${kind}.${field} did not take the matured value`).toBe(value);
      }
    }
  });

  it('leaves every stat the form does not name exactly where it was', () => {
    for (const kind of GROWN) {
      const form = maturedFormOf(kind);
      if (form === null) continue;

      const moved = new Set(Object.keys(form.stats));
      const base = statMap(kind, false);
      const grown = statMap(kind, true);
      for (const field of numericFields(kind)) {
        if (moved.has(field)) continue;
        expect(grown[field], `${kind}.${field} moved without being asked to`).toBe(base[field]);
      }
    }
  });

  it('keeps the kind, because a matured cell is the same lineage', () => {
    for (const kind of GROWN) {
      expect(statsFor({ kind, matured: true }).kind).toBe(kind);
    }
  });

  it('reads the base table for a grown cell of a kind that has no matured form', () => {
    for (const kind of PLAIN) {
      expect(statsFor({ kind, matured: true })).toEqual(DEFENDERS[kind]);
    }
  });

  it('never hands back the table itself, so a caller cannot edit content by accident', () => {
    for (const kind of GROWN) {
      expect(statsFor({ kind, matured: true })).not.toBe(DEFENDERS[kind]);
    }
  });
});

describe('maturationOffer', () => {
  it('offers the form to a cell that has one and has not taken it', () => {
    for (const kind of GROWN) {
      expect(maturationOffer({ kind, matured: false })).toBe(maturedFormOf(kind));
    }
  });

  it('offers nothing to a cell that has already grown', () => {
    for (const kind of GROWN) {
      expect(maturationOffer({ kind, matured: true })).toBeNull();
    }
  });

  it('offers nothing to a kind with no matured form', () => {
    for (const kind of PLAIN) {
      expect(maturationOffer({ kind, matured: false })).toBeNull();
    }
  });
});
