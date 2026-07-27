import { describe, expect, it } from 'vitest';
import { step } from './step';
import { createSimState } from './state';
import { startWave } from './commands';
import { DEFENDERS } from './content/defenders';
import { PATHOGENS } from './content/pathogens';
import { STEP_SECONDS, TAG_REWARD_MULTIPLIER, TISSUE_PIPS } from './content/rules';
import { scheduleDormancy } from './systems/hazards';
import { addEnemy, addTowerOnPath, simFor } from './testing';
import type { CaseId, Enemy, PathogenKind, PhagocyteTower, SimState } from './types';

function build(caseId: CaseId = 'forearm'): SimState {
  return createSimState({
    caseId,
    immunity: { staph: 0, film: 0, virus: 0 },
    clearedCount: 0,
    totalKills: 0,
  });
}

/** Mid-wave with nothing queued, so a test controls exactly what is on the board. */
function fighting(caseId: CaseId = 'forearm'): SimState {
  return simFor(caseId);
}

function spawnAt(state: SimState, kind: PathogenKind, travelled: number): Enemy {
  return addEnemy(state, kind, { distance: travelled });
}

/** A phagocyte placed exactly on the path at `travelled`, so anything there is inside its reach. */
function phagocyteOnPathAt(state: SimState, travelled: number): PhagocyteTower {
  return addTowerOnPath(state, 'phago', travelled);
}

/**
 * Keeps the wave open without putting anything on the board: one entry left in the queue with
 * its spawn held off indefinitely. Tests that read energy need this, because a wave that ends
 * pays a clear bonus — run flow that `run.test.ts` owns and that would otherwise land in the
 * middle of an economy assertion.
 */
function holdWaveOpen(state: SimState): void {
  state.queue = ['staph'];
  state.spawnTimer = Number.MAX_SAFE_INTEGER;
}

/** Bounded so a mechanic that never fires fails the suite instead of hanging it. */
function advanceUntil(state: SimState, done: () => boolean, maxSteps = 3000): number {
  for (let taken = 0; taken < maxSteps; taken += 1) {
    if (done()) return taken;
    step(state, STEP_SECONDS);
  }
  throw new Error(`condition never held within ${String(maxSteps)} steps`);
}

describe('step — engulf acquisition', () => {
  /**
   * Decision D9, spec §5.1. The prototype built its `held` list before movement but grabbed
   * inside the defender pass afterwards, so a newly engulfed enemy advanced one more step
   * before freezing. Acquisition is now its own pass, ahead of movement.
   */
  it('freezes an enemy on the very step it is engulfed — decision D9', () => {
    const state = fighting();
    const tower = phagocyteOnPathAt(state, 0);
    const prey = spawnAt(state, 'staph', 0);

    step(state, STEP_SECONDS);

    expect(tower.holdingEnemyId).toBe(prey.id);
    expect(prey.distance).toBe(0);
  });

  it('lets an enemy the phagocyte cannot reach keep moving', () => {
    const state = fighting();
    phagocyteOnPathAt(state, 0);
    const free = spawnAt(state, 'staph', DEFENDERS.phago.range * 4);

    step(state, STEP_SECONDS);

    expect(free.distance).toBeGreaterThan(DEFENDERS.phago.range * 4);
  });

  it('gives each phagocyte its own prey rather than both grabbing the leader', () => {
    const state = fighting();
    phagocyteOnPathAt(state, 0);
    phagocyteOnPathAt(state, 0);
    const first = spawnAt(state, 'staph', 0);
    const second = spawnAt(state, 'staph', 0);

    step(state, STEP_SECONDS);

    const holds = state.towers.map((tower) => (tower.kind === 'phago' ? tower.holdingEnemyId : null));
    expect(new Set(holds)).toEqual(new Set([first.id, second.id]));
    expect(first.distance).toBe(0);
    expect(second.distance).toBe(0);
  });

  it('does not let a stunned phagocyte grab anything', () => {
    const state = fighting();
    const tower = phagocyteOnPathAt(state, 0);
    tower.stun = 1;
    const prey = spawnAt(state, 'staph', 0);

    step(state, STEP_SECONDS);

    expect(tower.holdingEnemyId).toBeNull();
    expect(prey.distance).toBeGreaterThan(0);
  });

  it('releases a hold when its prey is gone', () => {
    const state = fighting();
    const tower = phagocyteOnPathAt(state, 0);
    tower.holdingEnemyId = 999;

    step(state, STEP_SECONDS);

    expect(tower.holdingEnemyId).toBeNull();
  });
});

describe('step — the starting dock working together', () => {
  /**
   * The whole Phase 5 chain through the real loop: a phagocyte holds its prey still, an
   * antibody marks it, a killer cell finishes it, the economy pays the tagged rate, and the
   * phagocyte drops into a rest. Nothing here depends on the enemy outrunning anything —
   * it is engulfed, so tuning cannot move it out of reach.
   */
  it('engulfs, tags and executes one enemy, then pays the tagged bounty', () => {
    // Throat, so no wound bleed or poison tick moves energy or defender health underneath us.
    const state = fighting('throat');
    const phago = phagocyteOnPathAt(state, 100);
    addTowerOnPath(state, 'anti', 100);
    addTowerOnPath(state, 'nk', 100);
    const prey = spawnAt(state, 'staph', 100);
    state.energy = 0;
    holdWaveOpen(state);

    advanceUntil(state, () => state.enemies.length === 0);

    expect(prey.tag).toBeGreaterThan(0);
    expect(state.energy).toBe(Math.round(PATHOGENS.staph.reward * TAG_REWARD_MULTIPLIER));
    expect(state.energy).toBeGreaterThan(PATHOGENS.staph.reward);
    expect(state.waveKills).toBe(1);
    expect(state.tissue).toBe(TISSUE_PIPS);
    expect(phago.holdingEnemyId).toBeNull();
    expect(phago.digested).toBeGreaterThan(0);
    expect(phago.rest).toBeGreaterThan(0);
  });

  it('pays nothing and costs a pip when an enemy gets through', () => {
    const state = fighting();
    state.energy = 0;
    holdWaveOpen(state);
    spawnAt(state, 'staph', state.path.total);

    step(state, STEP_SECONDS);

    expect(state.energy).toBe(0);
    expect(state.waveKills).toBe(0);
    expect(state.tissue).toBe(TISSUE_PIPS - 1);
  });
});

describe('step — run state', () => {
  it('removes an enemy that reached the end and charges a tissue pip', () => {
    const state = fighting();
    spawnAt(state, 'staph', state.path.total);

    step(state, STEP_SECONDS);

    expect(state.enemies).toHaveLength(0);
    expect(state.tissue).toBe(TISSUE_PIPS - 1);
  });

  it('ends the case as a loss when the last tissue pip goes', () => {
    const state = fighting();
    state.tissue = 1;
    spawnAt(state, 'staph', state.path.total);

    step(state, STEP_SECONDS);

    expect(state.phase).toBe('done');
    expect(state.result).toBe('lost');
  });

  it('ends the wave once the queue and the board are both empty', () => {
    const state = fighting();
    step(state, STEP_SECONDS);
    expect(state.phase).toBe('built');
  });

  it('keeps the wave running while anything is still queued', () => {
    const state = build();
    startWave(state);
    step(state, STEP_SECONDS);
    expect(state.phase).toBe('wave');
  });

  it('runs the fever timer down and expires it exactly at zero', () => {
    const state = fighting();
    state.queue = ['staph'];
    state.fever = STEP_SECONDS * 1.5;

    step(state, STEP_SECONDS);
    expect(state.fever).toBeCloseTo(STEP_SECONDS * 0.5, 9);

    step(state, STEP_SECONDS);
    expect(state.fever).toBe(0);
  });

  it('sweeps a destroyed defender off the board', () => {
    const state = fighting();
    const tower = phagocyteOnPathAt(state, 0);
    tower.hp = 0;

    step(state, STEP_SECONDS);

    expect(state.towers).toHaveLength(0);
  });

  it('ages beams out rather than leaving them on the board forever', () => {
    const state = fighting();
    state.queue = ['staph'];
    state.beams.push({ fromX: 0, fromY: 0, toX: 1, toY: 1, life: STEP_SECONDS, source: 'anti' });

    step(state, STEP_SECONDS);

    expect(state.beams).toHaveLength(0);
  });
});

/**
 * The dormancy rule's one claim on `step`: a wave is not over while something it killed is still
 * lying there waiting to get back up. Without this the board empties, the wave is called held, and
 * the relapse either never happens or arrives in the middle of the next wave — which is a spawn,
 * not a relapse.
 */
describe('step — a wave is not over while something is still down', () => {
  function withSomethingDown(): SimState {
    const state = fighting('hand');
    const enemy = addEnemy(state, 'staph', { distance: 150 });
    for (let draw = 0; draw < 200 && state.dormant.length === 0; draw += 1) {
      scheduleDormancy(state, enemy);
    }
    expect(state.dormant, 'nothing went dormant, so this asserts nothing').toHaveLength(1);
    state.enemies = [];
    state.queue = [];
    return state;
  }

  it('keeps the wave running on an empty board and an empty queue', () => {
    const state = withSomethingDown();

    step(state, STEP_SECONDS);

    expect(state.enemies).toHaveLength(0);
    expect(state.queue).toHaveLength(0);
    expect(state.phase).toBe('wave');
  });

  it('holds it open until the revenant is up, and calls it once that body is gone', () => {
    const state = withSomethingDown();

    advanceUntil(state, () => state.enemies.length > 0);
    expect(state.phase).toBe('wave');
    expect(state.dormant).toEqual([]);

    state.enemies = [];
    step(state, STEP_SECONDS);

    expect(state.phase).toBe('built');
  });

  /** A region that has fallen is finished with. Nothing is left queued to wake into it. */
  it('drops what is still down when the last tissue pip goes', () => {
    const state = withSomethingDown();
    state.tissue = 1;
    spawnAt(state, 'staph', state.path.total);

    step(state, STEP_SECONDS);

    expect(state.result).toBe('lost');
    expect(state.dormant).toEqual([]);
  });
});
