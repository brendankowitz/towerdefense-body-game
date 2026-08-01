import { describe, expect, it } from 'vitest';
import { createSimState, distance } from './state';
import { CASES, CASE_BY_ID, caseHasRule } from './content/cases';
import { PATHOGENS } from './content/pathogens';
import { IMMUNITY_MAX, TISSUE_PIPS } from './content/rules';
import { compilePath } from './path';
import { armourMultiplier } from './systems/targeting';
import { addEnemy } from './testing';
import type { SimInput } from './state';

const input: SimInput = {
  caseId: 'forearm',
  immunity: { staph: 0, film: 0, virus: 0 },
  clearedCount: 0,
  day: 1,
  totalKills: 0,
};

describe('createSimState', () => {
  it('starts in build phase with the case starting energy and full tissue', () => {
    const state = createSimState(input);
    expect(state.phase).toBe('build');
    expect(state.energy).toBe(CASE_BY_ID.forearm.startingEnergy);
    expect(state.tissue).toBe(TISSUE_PIPS);
    expect(state.waveCount).toBe(CASE_BY_ID.forearm.waves.length);
  });

  it('preselects the phagocyte, as the prototype does on case start', () => {
    expect(createSimState(input).selected).toBe('phago');
  });

  it('starts with nothing on the board and no result', () => {
    const state = createSimState(input);
    expect(state.towers).toHaveLength(0);
    expect(state.enemies).toHaveLength(0);
    expect(state.queue).toHaveLength(0);
    expect(state.result).toBeNull();
  });

  it('compiles the case path it was asked for', () => {
    for (const shipped of CASES) {
      const state = createSimState({ ...input, caseId: shipped.id });
      expect(state.rules).toEqual(shipped.rules.map((rule) => rule.kind));
      expect(state.path.total).toBe(compilePath(shipped.path).total);
    }
  });

  it('carries profile facts in without letting the case override them', () => {
    const state = createSimState({ ...input, immunity: { staph: 2, film: 1, virus: 3 }, clearedCount: 2, totalKills: 41 });
    expect(state.immunity).toEqual({ staph: 2, film: 1, virus: 3 });
    expect(state.clearedCount).toBe(2);
    expect(state.totalKills).toBe(41);
  });

  /**
   * Decision D2. The prototype held the spent-shield marker on a loop instance field that
   * `startCase` never reset, so replaying a case silently lost the tetanus bounce.
   */
  it('resets the spent tetanus shield at case start — decision D2', () => {
    const first = createSimState(input);
    first.shieldedWave = 4;
    expect(createSimState(input).shieldedWave).toBeNull();
  });

  it('starts with no inflammation banked', () => {
    expect(createSimState(input).inflammation).toBe(0);
  });
});

/**
 * The amnesia rule lives here and only here: a case names a strain, and the state it is built with
 * reads that strain as zero. Everything downstream — the bounce, the suppressed split, the dropped
 * armour — is written against `state.immunity` and needs to know nothing about the rule.
 *
 * The case is found by rule rather than named, so this suite follows the season rather than a case
 * id, and says so loudly if no case carries the rule any more.
 */
describe('amnesia — one immunity does not work here', () => {
  const wiping = CASES.find((definition) => caseHasRule(definition, 'amnesia'));
  const held = { staph: IMMUNITY_MAX, film: IMMUNITY_MAX, virus: IMMUNITY_MAX };

  it('has a case that carries the rule, naming the strain it takes', () => {
    expect(wiping, 'no amnesia case in the season').toBeDefined();
    expect(wiping?.wipes, `${wiping?.id ?? 'the amnesia case'} wipes nothing`).toBeDefined();
  });

  it('reads the named strain as zero while leaving the rest of the profile alone', () => {
    if (wiping?.wipes === undefined) return;

    const state = createSimState({ ...input, caseId: wiping.id, immunity: held });

    expect(state.immunity[wiping.wipes]).toBe(0);
    for (const strain of ['staph', 'film', 'virus'] as const) {
      if (strain === wiping.wipes) continue;
      expect(state.immunity[strain], `${strain} was wiped as well`).toBe(IMMUNITY_MAX);
    }
  });

  /**
   * The wiring from `blocksAmnesia` through `createSimState` to `immunityFor` traces correctly by
   * reading, but nothing before this exercised it end to end: every other test in this file builds
   * an ordinary `SimInput` with `blocksAmnesia` left unset. This is the one that actually sets it
   * against a real amnesia case, so a break anywhere on that path — the field never reaching
   * `immunityFor`, or `immunityFor` reading it wrong — shows up here rather than passing silently.
   */
  it('leaves the wiped strain intact once MMR has blocked the wipe', () => {
    if (wiping?.wipes === undefined) return;

    const state = createSimState({ ...input, caseId: wiping.id, immunity: held, blocksAmnesia: true });

    expect(state.immunity[wiping.wipes], 'MMR blocked the wipe but the strain still read zero').toBe(IMMUNITY_MAX);
  });

  it('never touches the profile object it was handed', () => {
    if (wiping === undefined) return;

    const profileImmunity = { ...held };
    createSimState({ ...input, caseId: wiping.id, immunity: profileImmunity });

    expect(profileImmunity, 'the wipe was written back onto the profile').toEqual(held);
  });

  it('leaves every other case holding everything the profile earned', () => {
    for (const definition of CASES) {
      if (caseHasRule(definition, 'amnesia')) continue;
      const state = createSimState({ ...input, caseId: definition.id, immunity: held });
      expect(state.immunity, `${definition.id} lost an immunity it was not meant to`).toEqual(held);
    }
  });

  /**
   * The mask is only worth having if the simulation feels it, so this asserts the effect rather
   * than the field: armour is dropped for a player holding the Biofilm serum, and an amnesia case
   * that wipes film is a case where it is not.
   *
   * Written against the same board twice — one state built with the serum held, one with it not —
   * so what is compared is the rule and not the pathogen table.
   */
  it('puts the armour back on a body the held vaccine would have stripped', () => {
    if (wiping?.wipes !== 'film') return;

    const wiped = createSimState({ ...input, caseId: wiping.id, immunity: held });
    const ordinary = createSimState({ ...input, caseId: 'stomach', immunity: held });

    expect(
      armourMultiplier(ordinary, addEnemy(ordinary, 'film')),
      'the serum did nothing on an ordinary case',
    ).toBe(1);
    expect(armourMultiplier(wiped, addEnemy(wiped, 'film'))).toBe(PATHOGENS.film.armour);
  });
});

describe('distance', () => {
  it('measures a 3-4-5 triangle', () => {
    expect(distance(0, 0, 3, 4)).toBe(5);
  });

  it('is zero for coincident points', () => {
    expect(distance(7, 7, 7, 7)).toBe(0);
  });

  it('is symmetric in its arguments', () => {
    expect(distance(-3, 11, 8, -2)).toBe(distance(8, -2, -3, 11));
  });
});
