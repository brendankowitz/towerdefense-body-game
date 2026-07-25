import { describe, expect, it } from 'vitest';
import { placeDefender, startWave, triggerFever } from './commands';
import { DEFENDERS } from './content/defenders';
import { IMMUNITY_MAX, STEP_SECONDS } from './content/rules';
import { hashState } from './hash';
import { createSimState } from './state';
import { step } from './step';
import type { CaseId, DefenderKind, SimState, StrainId } from './types';

/**
 * Fixed boards, fixed seeds, a fixed number of steps. If the snapshot changes, simulation
 * behaviour changed. Deliberate (a tuning or mechanics change): re-bless with
 *   npx vitest run src/game/golden.test.ts -u
 * and review the snapshot diff. Not deliberate (a presentation phase touched it): a bug.
 *
 * Two things this net has to get right to be worth having:
 *
 * It samples the run rather than only its end. A finished wave converges — empty board, expired
 * timers — so very different runs reach the same end state. Hashing the trajectory catches a
 * change in how the wave was fought, not only in how it came out.
 *
 * It runs all three cases on late waves, so every pathogen behaviour and every defender is
 * actually exercised. A single early wave of one case is eight identical bacteria: a damage
 * retune moved nothing in it, because the killer cell one-shot them either way.
 *
 * This is a reproducibility net, never a balance freeze. No assertion here reads a gameplay
 * number, and each board is funded from the costs it is about to pay, so a cost retune re-blesses
 * the snapshot rather than failing to place a defender.
 */

const GOLDEN_STEPS = 1800;
const SAMPLE_EVERY = 120;

interface Scenario {
  readonly caseId: CaseId;
  /** Late waves, where the mixed compositions live. */
  readonly waveIndex: number;
  readonly immunity: Readonly<Record<StrainId, number>>;
  readonly board: readonly (readonly [DefenderKind, number])[];
  /** Step at which fever is called, for the scenario that covers the slow. */
  readonly feverAtStep?: number;
}

const SCENARIOS: readonly Scenario[] = [
  // Wound: no clot, so the bleed runs; full staph immunity, so the tetanus shield bounces.
  {
    caseId: 'forearm',
    waveIndex: 3,
    immunity: { staph: IMMUNITY_MAX, film: 0, virus: 0 },
    board: [['anti', 0], ['nk', 1], ['phago', 2], ['mast', 3], ['mem', 4]],
  },
  // Virus: splitting, spore regeneration, biofilm armour, clot slow and wear, and fever.
  {
    caseId: 'throat',
    waveIndex: 3,
    immunity: { staph: 0, film: 0, virus: 0 },
    board: [['clot', 0], ['anti', 1], ['nk', 2], ['phago', 3], ['mem', 4]],
    feverAtStep: 300,
  },
  // Poison: defenders taking damage, toxin stun, resistant strains, and the Biofilm serum.
  {
    caseId: 'stomach',
    waveIndex: 4,
    immunity: { staph: 0, film: IMMUNITY_MAX, virus: 0 },
    board: [['clot', 0], ['anti', 1], ['phago', 2], ['mast', 3], ['nk', 4]],
  },
];

function armBoard(scenario: Scenario): SimState {
  const state = createSimState({
    caseId: scenario.caseId,
    immunity: scenario.immunity,
    clearedCount: 2,
    totalKills: 0,
  });

  state.waveIndex = scenario.waveIndex;
  state.energy = scenario.board.reduce((total, [kind]) => total + DEFENDERS[kind].cost, 0);
  for (const [kind, spot] of scenario.board) {
    state.selected = kind;
    if (!placeDefender(state, spot)) {
      throw new Error(`Could not place ${kind} on spot ${String(spot)} of ${scenario.caseId}`);
    }
  }

  startWave(state);
  return state;
}

function trajectory(scenario: Scenario): readonly string[] {
  const state = armBoard(scenario);
  const samples: string[] = [];

  for (let taken = 1; taken <= GOLDEN_STEPS; taken += 1) {
    if (taken === scenario.feverAtStep) triggerFever(state);
    step(state, STEP_SECONDS);
    if (taken % SAMPLE_EVERY === 0) samples.push(hashState(state));
  }
  return samples;
}

function goldenRun(): Record<CaseId, string> {
  const runs = {} as Record<CaseId, string>;
  for (const scenario of SCENARIOS) runs[scenario.caseId] = trajectory(scenario).join(' ');
  return runs;
}

describe('golden run', () => {
  it('reproduces byte-identically across executions', () => {
    expect(goldenRun()).toEqual(goldenRun());
  });

  it('samples runs that actually move, so the snapshot has something to pin', () => {
    for (const scenario of SCENARIOS) {
      expect(new Set(trajectory(scenario)).size).toBeGreaterThan(1);
    }
  });

  it('matches the blessed snapshot', () => {
    expect(goldenRun()).toMatchSnapshot();
  });
});
