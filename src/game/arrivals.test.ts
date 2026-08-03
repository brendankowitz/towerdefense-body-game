import { describe, expect, it } from 'vitest';
import { arrivalKindFor, callArrivals, callSeed, noteRecognition, stepArrivals } from './arrivals';
import { placeDefender, startWave } from './commands';
import { CASES, caseHasRule } from './content/cases';
import { DEFENDERS, DEFENDER_ORDER } from './content/defenders';
import {
  ARRIVAL_USES, IMMUNITY_MAX, KILLER_MIX_CHANCE, RECOGNITION_PER_CALL, STEP_SECONDS,
} from './content/rules';
import { hashState } from './hash';
import { createSimState } from './state';
import { step } from './step';
import { isTagged } from './systems/targeting';
import { addEnemy, arrivedAt, mountPosition, simFor } from './testing';
import type { Arrival, CaseId, DefenderKind, SimState } from './types';

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

/**
 * The two properties the rolls behind a call have to hold at once, and they pull against each
 * other: a roll that differs between boards is the whole point of a probability, and a roll that
 * differs between two plays of the *same* board would take the golden run and the whole sweep with
 * it. `callSeed` is the one mechanism that answers both, so both are asserted against it here.
 *
 * Boards are played through the real `step` on the real timestep, with the balance handed over
 * rather than earned: these are about which numbers a call draws, and a run that had to play its
 * way to a full board would be asserting the economy on the way past.
 */
const EVERY_STRAIN = { staph: IMMUNITY_MAX, film: IMMUNITY_MAX, virus: IMMUNITY_MAX };

/** The board at one index of the odometer over the whole dock, spot 0 turning fastest. */
function boardAt(index: number, spots: number): readonly DefenderKind[] {
  const board: DefenderKind[] = [];
  let rest = index;
  for (let spot = 0; spot < spots; spot += 1) {
    board.push(DEFENDER_ORDER[rest % DEFENDER_ORDER.length] ?? 'phago');
    rest = Math.floor(rest / DEFENDER_ORDER.length);
  }
  return board;
}

/** One wave of one case, standing on the whole board, with every strain remembered. */
function playing(caseId: CaseId, waveIndex: number, board: readonly DefenderKind[]): SimState {
  const state = createSimState({
    caseId, immunity: EVERY_STRAIN, day: CASES.length + 1, totalKills: 0,
  });
  state.waveIndex = waveIndex;
  // Enough to stand the board up, then spent — so no board carries a balance the others do not.
  state.energy = 100_000;
  board.forEach((kind, spotIndex) => {
    state.selected = kind;
    if (!placeDefender(state, spotIndex)) throw new Error(`could not place ${kind}`);
  });
  state.energy = 0;
  startWave(state);
  return state;
}

/**
 * A case nothing but the response draws from the shared stream on. `buildQueue` reseeds
 * `state.rngState` from the case and the wave at every wave boundary, and `scheduleDormancy` is the
 * only other writer inside a wave — so on a case without that rule every board stands at the
 * *identical* stream position at the same step of the same wave, which is the condition the
 * decorrelation claim is about. Found rather than named, so a rules change cannot leave this
 * measuring something else under the old case's name.
 */
const UNTOUCHED_STREAM: CaseId = CASES
  .filter((definition) => !caseHasRule(definition, 'dormant'))
  .map((definition) => definition.id)
  .find((id) => id === 'vesper') ?? 'forearm';

/** Landings, in order, with the two rolls a landing shows: which mount, and which kind. */
function landings(state: SimState, steps: number): readonly string[] {
  const seen: string[] = [];
  let occupied = 0;
  for (let taken = 1; taken <= steps; taken += 1) {
    step(state, STEP_SECONDS);
    let mask = 0;
    for (const arrival of state.arrivals) mask |= 1 << arrival.mountIndex;
    const fresh = mask & ~occupied;
    if (fresh !== 0) {
      for (const arrival of state.arrivals) {
        if ((fresh & (1 << arrival.mountIndex)) === 0) continue;
        seen.push(`${String(taken)}:${String(arrival.mountIndex)}:${arrival.kind}`);
      }
    }
    occupied = mask;
  }
  return seen;
}

describe('the roll behind a call', () => {
  const SPREAD = 240;
  const SETTLE_STEPS = 300;
  const WATCH_STEPS = 1800;
  const LATE_WAVE = 4;

  /**
   * **Decorrelated.** Every board in the spread is played to the same step of the same wave of the
   * same case, so all of them stand at one stream position — asserted, because it is the premise
   * and not a detail: it is exactly the thing that used to hand all 7776 boards of a case the same
   * three numbers at the *k*-th call of a wave, and it is still true of the stream. What must not
   * be true any more is that the roll follows from it.
   *
   * The spread strides the whole odometer rather than taking the first few hundred boards, which
   * differ only in their last spot; every board here differs from its neighbour in every spot.
   *
   * Distinctness is asserted exactly rather than as a share. The input is deterministic, so this
   * is not a sample that might collide on a bad day — a collision would be two boards genuinely
   * folding to one 32-bit word, which is a fact worth being told about rather than absorbed by a
   * threshold.
   */
  it('is not forced on every board of a case by the stream alone', () => {
    const spots = CASES.find((c) => c.id === UNTOUCHED_STREAM)?.spots.length ?? 5;
    const total = DEFENDER_ORDER.length ** spots;

    const streams = new Set<number>();
    const seeds = new Set<number>();
    for (let n = 0; n < SPREAD; n += 1) {
      const state = playing(UNTOUCHED_STREAM, 0, boardAt(Math.floor((n * total) / SPREAD), spots));
      for (let taken = 0; taken < SETTLE_STEPS; taken += 1) step(state, STEP_SECONDS);
      streams.add(state.rngState);
      seeds.add(callSeed(state));
    }

    expect(streams.size, 'the boards are not at one stream position, so this proves nothing').toBe(1);
    expect(seeds.size, 'boards at one stream position were handed one roll').toBe(SPREAD);
  });

  /**
   * **Replayable**, and stated over the two things a replay of an answered call has to reproduce:
   * every landing it produced, and the state it left behind. The second is what `hash.ts`'s golden
   * run protects across the whole simulation; this is the same claim aimed at the call, so a seed
   * that reached for anything outside sim state fails here first and by name.
   */
  it('gives the same board the same help twice, landing for landing', () => {
    // Named rather than taken off the odometer, because a replay needs a board that is actually
    // answered: two antibodies to lay the marks a call is banked from, and three phagocytes to keep
    // the tissue standing long enough for the calls to be made. It receives three landings.
    const board: readonly DefenderKind[] = ['anti', 'anti', 'phago', 'phago', 'phago'];
    const first = playing(UNTOUCHED_STREAM, LATE_WAVE, board);
    const second = playing(UNTOUCHED_STREAM, LATE_WAVE, board);

    const firstLandings = landings(first, WATCH_STEPS);

    expect(firstLandings.length, 'the board received no help, so a replay of it proves nothing')
      .toBeGreaterThan(0);
    expect(landings(second, WATCH_STEPS)).toEqual(firstLandings);
    expect(hashState(second)).toBe(hashState(first));
  });

  /**
   * The defect the two properties above were fixed for, stated from outside the mechanism.
   *
   * With the rolls following from the stream alone, the kind of the *k*-th call of a wave was one
   * constant across every board of the case, so a case whose constant sat above `KILLER_MIX_CHANCE`
   * could never deliver a killer at any board and at any setting under it — measured at the time as
   * vesper answering 169 calls without one. `Brief.tsx` promises both kinds at full memory for any
   * positive value of the dial, so that was a promise the build could not keep.
   */
  it('sends both kinds of help across a spread of boards at full memory', () => {
    expect(
      KILLER_MIX_CHANCE > 0 && KILLER_MIX_CHANCE < 1,
      'the dial is at an end of its range, so one kind is content nothing can reach',
    ).toBe(true);

    const kinds = new Set<Arrival['kind']>();
    let landed = 0;
    for (let n = 0; n < SPREAD; n += 1) {
      const state = playing(UNTOUCHED_STREAM, LATE_WAVE, boardAt(n * 31, 5));
      for (const landing of landings(state, WATCH_STEPS)) {
        landed += 1;
        kinds.add(landing.endsWith('killer') ? 'killer' : 'antibody');
      }
    }

    expect(landed, 'no help landed anywhere in the spread').toBeGreaterThan(0);
    expect([...kinds].sort(), `${String(landed)} landings and only one kind of help`)
      .toEqual(['antibody', 'killer']);
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
