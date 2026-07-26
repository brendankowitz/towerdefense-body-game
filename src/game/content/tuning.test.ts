import { afterEach, describe, expect, it } from 'vitest';
import {
  applyDefenderTuning, applyMaturationTuning, applyPathogenTuning, applyWaveTuning,
  exportContentModules, listTunables, resetTuning,
} from './tuning';
import { DEFENDERS } from './defenders';
import { MATURED_FORMS } from './maturation';
import { PATHOGENS } from './pathogens';
import { CASES } from './cases';
import { statsFor } from '../systems/stats';

/** Content tables are plain JSON-safe data; a JSON round-trip is a sufficient deep clone. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

afterEach(() => { resetTuning(); });

describe('applyDefenderTuning', () => {
  it('changes the live value the simulation reads', () => {
    const before = DEFENDERS.phago.dps;
    applyDefenderTuning('phago', { dps: before + 5 });
    expect(DEFENDERS.phago.dps).toBe(before + 5);
  });

  it('rejects a field the defender does not have', () => {
    // @ts-expect-error clot has no dps — the type system is the first guard
    expect(() => { applyDefenderTuning('clot', { dps: 1 }); }).toThrow(/unknown field/i);
  });

  it('rejects a non-finite value', () => {
    expect(() => { applyDefenderTuning('phago', { dps: Number.NaN }); }).toThrow(/finite/i);
  });

  it('leaves the value unchanged when the patch is rejected', () => {
    const before = DEFENDERS.phago.dps;
    expect(() => { applyDefenderTuning('phago', { dps: Number.NaN }); }).toThrow();
    expect(DEFENDERS.phago.dps).toBe(before);
  });
});

/**
 * `statsFor` merges a matured form on top of the defender table, so a stat the form names is the
 * one the grown cell fights with and the base table's value for it never reaches the board. These
 * assert against `statsFor` rather than against the table, because that is the thing that was
 * broken: the panel could move `DEFENDERS.phago.range` all day and the macrophage never noticed.
 */
describe('applyMaturationTuning', () => {
  const GROWN_PHAGO = { kind: 'phago', matured: true } as const;

  it('changes the reach a grown cell actually fights with', () => {
    const before = statsFor(GROWN_PHAGO).range;
    applyMaturationTuning('phago', { range: before + 30 });
    expect(statsFor(GROWN_PHAGO).range).toBe(before + 30);
  });

  it('is the only thing that can move a stat the matured form overrides', () => {
    const grownBefore = statsFor(GROWN_PHAGO).dps;
    applyDefenderTuning('phago', { dps: grownBefore + 500 });
    expect(statsFor(GROWN_PHAGO).dps, 'the macrophage names its own dps').toBe(grownBefore);

    applyMaturationTuning('phago', { dps: grownBefore + 500 });
    expect(statsFor(GROWN_PHAGO).dps).toBe(grownBefore + 500);
  });

  it('moves the energy the growth itself charges', () => {
    const before = MATURED_FORMS.phago?.cost;
    if (before === undefined) throw new Error('fixture expects the phagocyte to have a matured form');
    applyMaturationTuning('phago', { cost: before + 25 });
    expect(MATURED_FORMS.phago?.cost).toBe(before + 25);
  });

  it('rejects a stat the defender does not carry, which the type cannot rule out', () => {
    // `MaturedForm.stats` is one flat union over every defender, so `dps` on the clot's form
    // type-checks. The clot has no dps, so this must be refused at runtime.
    expect(() => { applyMaturationTuning('clot', { dps: 1 }); }).toThrow(/unknown field/i);
  });

  it('rejects a kind that has nothing to grow into', () => {
    expect(() => { applyMaturationTuning('nk', { range: 1 }); }).toThrow(/has none/i);
  });

  it('rejects a non-finite value', () => {
    expect(() => { applyMaturationTuning('phago', { range: Number.NaN }); }).toThrow(/finite/i);
  });

  it('leaves the form unchanged when the patch is rejected', () => {
    const before = statsFor(GROWN_PHAGO).range;
    expect(() => { applyMaturationTuning('phago', { range: before + 10, dps: Number.NaN }); }).toThrow();
    expect(statsFor(GROWN_PHAGO).range).toBe(before);
  });
});

describe('applyPathogenTuning', () => {
  it('changes the live value the simulation reads', () => {
    const before = PATHOGENS.staph.speed;
    applyPathogenTuning('staph', { speed: before + 10 });
    expect(PATHOGENS.staph.speed).toBe(before + 10);
  });

  it('moves an optional numeric field, such as armour', () => {
    const before = PATHOGENS.mrsa.armour;
    if (before === undefined) throw new Error('fixture expects mrsa to carry armour');
    applyPathogenTuning('mrsa', { armour: before + 0.1 });
    expect(PATHOGENS.mrsa.armour).toBeCloseTo(before + 0.1);
  });

  it('rejects a field the pathogen does not carry at runtime', () => {
    expect(() => { applyPathogenTuning('staph', { armour: 0.2 }); }).toThrow(/unknown field/i);
  });

  it('rejects a non-finite value', () => {
    expect(() => { applyPathogenTuning('staph', { speed: Number.POSITIVE_INFINITY }); }).toThrow(/finite/i);
  });
});

describe('applyWaveTuning', () => {
  it('changes the live spawn count the simulation reads', () => {
    const before = CASES[0]?.waves[0]?.[0]?.count;
    if (before === undefined) throw new Error('fixture expects forearm wave 0 entry 0 to exist');
    applyWaveTuning('forearm', 0, 'staph', before + 3);
    expect(CASES[0]?.waves[0]?.[0]?.count).toBe(before + 3);
  });

  it('rejects an unknown case', () => {
    // @ts-expect-error 'elbow' is not a CaseId — the type system is the first guard
    expect(() => { applyWaveTuning('elbow', 0, 'staph', 1); }).toThrow(/unknown case/i);
  });

  it('rejects an out-of-range wave index', () => {
    const forearm = CASES.find((c) => c.id === 'forearm');
    if (forearm === undefined) throw new Error('fixture expects the forearm case to exist');
    expect(() => { applyWaveTuning('forearm', forearm.waves.length, 'staph', 1); }).toThrow(/unknown wave index/i);
  });

  it('rejects a kind the wave does not list', () => {
    // Wave 0 of forearm lists only staph (content/cases.ts); mrsa never appears there.
    expect(() => { applyWaveTuning('forearm', 0, 'mrsa', 1); }).toThrow(/no mrsa entry/i);
  });

  it('rejects a negative count', () => {
    expect(() => { applyWaveTuning('forearm', 0, 'staph', -1); }).toThrow(/non-negative integer/i);
  });

  it('rejects a non-integer count', () => {
    expect(() => { applyWaveTuning('forearm', 0, 'staph', 1.5); }).toThrow(/non-negative integer/i);
  });
});

describe('resetTuning', () => {
  it('restores every seed defender and pathogen value, deep-equal to the untouched tables', () => {
    const defendersBefore = clone(DEFENDERS);
    const pathogensBefore = clone(PATHOGENS);

    applyDefenderTuning('phago', { dps: defendersBefore.phago.dps + 5, cost: defendersBefore.phago.cost + 5 });
    applyPathogenTuning('staph', { speed: pathogensBefore.staph.speed * 2 });

    resetTuning();

    expect(DEFENDERS).toEqual(defendersBefore);
    expect(PATHOGENS).toEqual(pathogensBefore);
  });

  it('restores every matured form, including an override the seed never had', () => {
    const before = clone(MATURED_FORMS);

    applyMaturationTuning('phago', { range: 500, cost: 1 });
    // `gap` is a stat the phagocyte carries but the macrophage does not override, so this adds a
    // key the seed has no entry for — a merge would leave it behind.
    applyMaturationTuning('phago', { gap: 9 });

    resetTuning();

    expect(MATURED_FORMS).toEqual(before);
  });

  it('restores every wave count, deep-equal to the untouched case table', () => {
    const casesBefore = clone(CASES);

    applyWaveTuning('forearm', 0, 'staph', 999);
    applyWaveTuning('stomach', 2, 'toxin', 1);

    resetTuning();

    expect(CASES).toEqual(casesBefore);
  });
});

describe('listTunables', () => {
  it('lists every numeric field of every defender and pathogen', () => {
    const fields = listTunables();
    expect(fields.some((f) => f.group === 'defender' && f.kind === 'phago' && f.field === 'dps')).toBe(true);
    expect(fields.some((f) => f.group === 'pathogen' && f.kind === 'mrsa' && f.field === 'armour')).toBe(true);
    expect(fields.every((f) => Number.isFinite(f.value))).toBe(true);
  });

  it('lists every stat a matured form overrides, and its growth cost', () => {
    const fields = listTunables();
    expect(fields.some((f) => f.group === 'maturation' && f.kind === 'phago' && f.field === 'range')).toBe(true);
    expect(fields.some((f) => f.group === 'maturation' && f.kind === 'phago' && f.field === 'cost')).toBe(true);
    expect(
      fields.some((f) => f.group === 'maturation' && f.kind === 'nk'),
      'the killer cell has no matured form to list',
    ).toBe(false);
  });

  it('never lists a non-numeric field', () => {
    expect(listTunables().some((f) => f.field === 'label' || f.field === 'name' || f.field === 'kind')).toBe(false);
  });

  it('reflects a tuned value immediately', () => {
    applyDefenderTuning('phago', { cost: DEFENDERS.phago.cost + 1 });
    const field = listTunables().find((f) => f.group === 'defender' && f.kind === 'phago' && f.field === 'cost');
    expect(field?.value).toBe(DEFENDERS.phago.cost);
  });
});

describe('exportContentModules', () => {
  it('emits the live values as compilable module source', () => {
    applyDefenderTuning('phago', { cost: DEFENDERS.phago.cost + 5 });
    const { defenders } = exportContentModules();
    expect(defenders).toContain(`cost: ${String(DEFENDERS.phago.cost)}`);
    expect(defenders).toContain('export const DEFENDERS');
  });

  it('emits an overridden pathogen value', () => {
    applyPathogenTuning('staph', { hp: PATHOGENS.staph.hp + 7 });
    const { pathogens } = exportContentModules();
    expect(pathogens).toContain(`hp: ${String(PATHOGENS.staph.hp)}`);
    expect(pathogens).toContain('export const PATHOGENS');
  });

  it('emits an overridden matured value, nested inside its stats object', () => {
    applyMaturationTuning('phago', { range: 123 });
    const { maturation } = exportContentModules();
    expect(maturation).toContain('export const MATURED_FORMS');
    expect(maturation).toContain('stats: { range: 123');
    expect(maturation, 'a nested object must never fall through to String()').not.toContain('[object Object]');
  });

  it('round-trips: exporting with no tuning applied reproduces the current defender values verbatim', () => {
    const { defenders } = exportContentModules();
    for (const d of Object.values(DEFENDERS)) expect(defenders).toContain(`cost: ${String(d.cost)}`);
  });

  it('round-trips: exporting with no tuning applied reproduces the current pathogen values verbatim', () => {
    const { pathogens } = exportContentModules();
    for (const p of Object.values(PATHOGENS)) expect(pathogens).toContain(`hp: ${String(p.hp)}`);
  });
});
