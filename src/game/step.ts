import { acquireHolds, runDefenders } from './systems/damage';
import { resolveDeaths } from './systems/deaths';
import { applyWoundBleed } from './systems/hazards';
import { applyMovement } from './systems/movement';
import { applySpawn } from './systems/spawn';
import type { SimState } from './types';

/** Holds carried over from last step, dropping any whose prey is gone or already dying. */
function collectHeld(state: SimState): Set<number> {
  const held = new Set<number>();
  for (const tower of state.towers) {
    if (tower.kind !== 'phago' || tower.holdingEnemyId === null) continue;

    const prey = state.enemies.find((enemy) => enemy.id === tower.holdingEnemyId);
    if (prey === undefined || prey.hp <= 0) {
      tower.holdingEnemyId = null;
      continue;
    }
    held.add(prey.id);
  }
  return held;
}

/** Ends a held wave. Phase 8 replaces this with the full run flow. */
function endWave(state: SimState): void {
  state.phase = 'built';
}

/**
 * One fixed step. The ordering is the contract: acquisition runs *before* movement so a
 * phagocyte's grab freezes its prey on the same step (decision D9), and the fever timer is
 * decremented *after* movement so movement reads this step's slow factor, not the next one's.
 */
export function step(state: SimState, dt: number): void {
  applySpawn(state, dt);
  applyWoundBleed(state, dt);

  const dead = new Set<number>();
  const held = collectHeld(state);
  acquireHolds(state, held, dead);

  applyMovement(state, dt, held, dead);
  runDefenders(state, dt);

  for (const tower of state.towers) {
    if (tower.kind === 'mast' && tower.flash > 0) tower.flash -= dt;
  }

  resolveDeaths(state, dead);

  state.towers = state.towers.filter((tower) => tower.hp > 0);
  for (const beam of state.beams) beam.life -= dt;
  state.beams = state.beams.filter((beam) => beam.life > 0);

  if (state.fever > 0) state.fever = Math.max(0, state.fever - dt);

  if (state.tissue <= 0) {
    state.phase = 'done';
    state.result = 'lost';
    return;
  }
  if (state.queue.length === 0 && state.enemies.length === 0) endWave(state);
}
