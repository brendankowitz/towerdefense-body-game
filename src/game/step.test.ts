import { describe, expect, it } from 'vitest';
import { step } from './step';
import { createSimState } from './state';
import { startWave } from './commands';
import { DEFENDERS } from './content/defenders';
import { PATHOGENS } from './content/pathogens';
import { STEP_SECONDS, TISSUE_PIPS, TOWER_MAX_HP } from './content/rules';
import { positionAt } from './path';
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
  const state = build(caseId);
  state.phase = 'wave';
  return state;
}

function spawnAt(state: SimState, kind: PathogenKind, travelled: number): Enemy {
  const stats = PATHOGENS[kind];
  const [x, y] = positionAt(state.path, travelled);
  const enemy: Enemy = {
    id: state.nextEnemyId, kind, distance: travelled, x, y,
    hp: stats.hp, maxHp: stats.hp, tag: 0, generation: 0,
  };
  state.nextEnemyId += 1;
  state.enemies.push(enemy);
  return enemy;
}

/** A phagocyte placed exactly on the path at `travelled`, so anything there is inside its reach. */
function phagocyteOnPathAt(state: SimState, travelled: number): PhagocyteTower {
  const [x, y] = positionAt(state.path, travelled);
  const tower: PhagocyteTower = {
    kind: 'phago', spotIndex: state.towers.length, x, y, hp: TOWER_MAX_HP, stun: 0,
    holdingEnemyId: null, eaten: 0, rest: 0,
  };
  state.towers.push(tower);
  return tower;
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
