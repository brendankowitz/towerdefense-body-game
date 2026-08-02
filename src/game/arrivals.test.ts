import { describe, expect, it } from 'vitest';
import { arrivalKindFor, callArrivals, noteRecognition, stepArrivals } from './arrivals';
import { startWave } from './commands';
import { CASES, caseHasRule } from './content/cases';
import { DEFENDERS } from './content/defenders';
import {
  ARRIVAL_USES, IMMUNITY_MAX, RECOGNITION_PER_CALL, STEP_SECONDS,
} from './content/rules';
import { isTagged } from './systems/targeting';
import { addEnemy, arrivedAt, mountPosition, simFor } from './testing';
import type { SimState } from './types';

/**
 * A body ready to answer, tuned by the one call each test cares about. `memory` defaults to full
 * immunity — "armed" means ready — so a test that only names `recognition` still exercises a roll
 * that can succeed, rather than one silently gated shut by an untouched default.
 */
function armed(overrides: {
  recognition?: number; memory?: number; rngState?: number;
} = {}): SimState {
  const state = simFor('forearm', { immunity: { staph: overrides.memory ?? IMMUNITY_MAX } });
  state.recognition = { staph: overrides.recognition ?? 0 };
  if (overrides.rngState !== undefined) state.rngState = overrides.rngState;
  return state;
}

/**
 * Every roll `arrivalKindFor` could plausibly be called with, real `rng.next()` output included:
 * `[0, 1)` in tenths. Swept rather than sampled once — `arrivalKindFor`'s own default (`1`) always
 * loses the coin, so a single call at the default proves nothing about the branch existing at all,
 * whichever way the test wants to point that fact.
 */
const ROLLS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] as const;

/** True the moment one roll in the swept range buys a killer at this memory level. */
function everSendsKiller(memory: number): boolean {
  return ROLLS.some((roll) => arrivalKindFor(memory, roll) === 'killer');
}

/**
 * True only if *no* roll in the swept range ever buys a killer — the check the memory gate itself
 * needs. A test that calls `arrivalKindFor(memory)` with no roll would pass whether or not the gate
 * existed, because the default already reads as "antibody"; sweeping the same domain
 * `everSendsKiller` does is what actually exercises the `memory < IMMUNITY_MAX` branch.
 */
function neverSendsKiller(memory: number): boolean {
  return !everSendsKiller(memory);
}

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

describe('calling for help', () => {
  /** The threshold is the whole of the pacing: below it nothing is spent and nothing is rolled. */
  it('rolls nothing until recognition reaches the threshold', () => {
    const state = armed({ recognition: RECOGNITION_PER_CALL - 1 });
    const before = state.rngState;
    callArrivals(state);
    expect(state.arrivals).toEqual([]);
    expect(state.rngState, 'a roll was spent below the threshold').toBe(before);
  });

  it('spends the threshold and rolls once it is reached', () => {
    const state = armed({ recognition: RECOGNITION_PER_CALL });
    callArrivals(state);
    expect(state.recognition.staph).toBe(0);
    expect(state.rngState).not.toBe(0);
  });

  /**
   * A rate, not a draw: one roll proves nothing about a probability. Walked over many seeds, a body
   * that knows a strain calls help more often than one that half knows it.
   */
  it('calls help more often the better the body knows the strain', () => {
    const rate = (memory: number): number => {
      let called = 0;
      for (let seed = 1; seed <= 400; seed += 1) {
        const state = armed({ recognition: RECOGNITION_PER_CALL, memory, rngState: seed });
        callArrivals(state);
        if (state.arrivals.length > 0) called += 1;
      }
      return called;
    };

    expect(rate(IMMUNITY_MAX)).toBeGreaterThan(rate(1));
    expect(rate(0), 'no memory called help').toBe(0);
  });

  it('never puts two arrivals on one mount point', () => {
    const state = armed({ recognition: RECOGNITION_PER_CALL * 20 });
    for (let call = 0; call < 20; call += 1) callArrivals(state);
    const used = state.arrivals.map((arrival) => arrival.mountIndex);
    expect(new Set(used).size).toBe(used.length);
  });
});

describe('an antibody arrival', () => {
  it('marks bodies in reach of the mount point it landed on', () => {
    const state = arrivedAt(0, 'antibody');
    const near = addEnemy(state, 'staph', mountPosition(state, 0));
    const far = addEnemy(state, 'staph', { x: 0, y: 0 });

    stepArrivals(state, STEP_SECONDS);

    expect(isTagged(near)).toBe(true);
    expect(isTagged(far)).toBe(false);
  });

  /**
   * Ammunition, not a timer. Against a particulate target an antibody is degraded with what it
   * bound, so each mark spends one use and the arrival leaves when it is out — and the player can
   * count what is left rather than guessing at a clock they cannot see.
   */
  it('spends one use per body it marks, and leaves when it is out', () => {
    const state = arrivedAt(0, 'antibody');
    for (let i = 0; i < ARRIVAL_USES; i += 1) addEnemy(state, 'staph', mountPosition(state, 0));

    stepArrivals(state, STEP_SECONDS);

    expect(state.arrivals).toEqual([]);
  });

  it('never spends a use on a body already carrying a mark', () => {
    const state = arrivedAt(0, 'antibody');
    const enemy = addEnemy(state, 'staph', mountPosition(state, 0));
    enemy.tag = DEFENDERS.anti.tag;

    stepArrivals(state, STEP_SECONDS);

    expect(state.arrivals[0]?.uses).toBe(ARRIVAL_USES);
  });
});

describe('a killer arrival', () => {
  /**
   * ADCC, and the guardrail the whole design rests on. A free killer that could hit anything would
   * stack with every board and make placement matter less; one that can only touch what is marked
   * is worth exactly what the player's own tagging makes it worth.
   */
  it('kills a marked body and cannot touch an unmarked one', () => {
    const state = arrivedAt(0, 'killer');
    const marked = addEnemy(state, 'staph', mountPosition(state, 0));
    const bare = addEnemy(state, 'staph', mountPosition(state, 0));
    marked.tag = DEFENDERS.anti.tag;
    const bareHp = bare.hp;

    stepArrivals(state, STEP_SECONDS);

    expect(marked.hp).toBeLessThan(marked.maxHp);
    expect(bare.hp, 'an unmarked body was hit').toBe(bareHp);
  });

  it('spends nothing on a board with nothing marked', () => {
    const state = arrivedAt(0, 'killer');
    addEnemy(state, 'staph', mountPosition(state, 0));
    stepArrivals(state, STEP_SECONDS);
    expect(state.arrivals[0]?.uses).toBe(ARRIVAL_USES);
  });

  /**
   * What memory buys, and it comes from the biology rather than being assigned: a first exposure
   * produces IgM, and IgG — the isotype ADCC runs on — is what repeat exposure produces.
   *
   * Swept across every roll `arrivalKindFor` could be called with, not called once at the
   * parameter's own default: a call with no roll passed always reads as "antibody" regardless of
   * whether the `memory < IMMUNITY_MAX` gate is even there, so a single-call assertion cannot tell
   * a real gate from a deleted one. `neverSendsKiller` sweeps the same domain `everSendsKiller`
   * does below, which is what actually exercises the gate on every memory short of a held vaccine.
   */
  it('is only ever sent to a body that has finished the strain', () => {
    for (let memory = 0; memory < IMMUNITY_MAX; memory += 1) {
      expect(neverSendsKiller(memory), `${String(memory)} clears sent a killer`).toBe(true);
    }
    expect(everSendsKiller(IMMUNITY_MAX)).toBe(true);
  });
});
