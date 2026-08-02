import { describe, expect, it } from 'vitest';
import { noteRecognition } from './arrivals';
import { startWave } from './commands';
import { CASES, caseHasRule } from './content/cases';
import { IMMUNITY_MAX } from './content/rules';
import { addEnemy, simFor } from './testing';

describe('recognition', () => {
  it('counts a tagged body toward the strain it belongs to', () => {
    const state = simFor('forearm', { immunity: { staph: IMMUNITY_MAX } });
    const enemy = addEnemy(state, 'staph');

    noteRecognition(state, enemy);

    expect(state.recognition.staph).toBe(1);
  });

  /**
   * No memory, no secondary response — the formula says it and no special case is needed. A body
   * the profile has never beaten three times still gets marked, it just calls nothing.
   */
  it('counts nothing for a strain the body has no memory of', () => {
    const state = simFor('forearm', { immunity: { staph: 0 } });
    noteRecognition(state, addEnemy(state, 'staph'));
    expect(state.recognition.staph ?? 0).toBe(0);
  });

  /** Only strains are tracked. A pollen or a toxin is not something a vaccine was ever earned for. */
  it('counts nothing for a body no vaccine exists for', () => {
    const state = simFor('sinus', { immunity: { staph: IMMUNITY_MAX } });
    noteRecognition(state, addEnemy(state, 'pollen'));
    // Object.values' declared signature drops the optionality a Partial<Record<...>> actually
    // carries — cast rather than assume, so a genuinely-undefined entry cannot slip past ?? 0.
    const values = Object.values(state.recognition) as readonly (number | undefined)[];
    expect(values.every((value) => (value ?? 0) === 0)).toBe(true);
  });

  /** Across waves, like the allergy rule's counter: a running total of the response, not of a wave. */
  it('carries across a wave boundary', () => {
    const state = simFor('forearm', { immunity: { staph: IMMUNITY_MAX } });
    noteRecognition(state, addEnemy(state, 'staph'));
    startWave(state);
    expect(state.recognition.staph).toBe(1);
  });

  /**
   * The amnesia rule, and the most dramatic thing it could possibly do — for free.
   *
   * `createSimState` masks the wiped strain to zero at the boundary, and this reads `state.immunity`
   * like everything else, so help for that strain stops arriving without a single line knowing the
   * rule exists. Asserted rather than assumed, because it is also the most confusing thing the rule
   * could do if it happened by accident: the case that takes your memory away is the case where the
   * body stops answering.
   */
  it('sends nothing for a strain an amnesia case has taken away', () => {
    const wiping = CASES.find((c) => caseHasRule(c, 'amnesia'));
    expect(wiping, 'no amnesia case in the season').toBeDefined();
    if (wiping?.wipes === undefined) return;

    const held = { staph: IMMUNITY_MAX, film: IMMUNITY_MAX, virus: IMMUNITY_MAX };
    const state = simFor(wiping.id, { immunity: held });
    noteRecognition(state, addEnemy(state, wiping.wipes));

    expect(state.recognition[wiping.wipes] ?? 0).toBe(0);
  });
});
