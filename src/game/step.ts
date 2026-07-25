import { WAVE_CLEAR_ENERGY } from './content/rules';
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

/**
 * The wave is held: nothing is queued and nothing is left on the board. The last wave of a case
 * ends the case instead of paying a wave bonus — the reward for that is banked by `clearCase`,
 * and reporting the one that was actually awarded is decision D5.
 */
function endWave(state: SimState): void {
  if (state.waveIndex >= state.waveCount - 1) {
    state.phase = 'done';
    state.result = 'case';
    return;
  }

  state.phase = 'built';
  state.result = 'wave';
  state.energy += WAVE_CLEAR_ENERGY;
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
  runDefenders(state, dt, dead);

  for (const tower of state.towers) {
    if (tower.kind === 'mast' && tower.flash > 0) tower.flash -= dt;
  }

  resolveDeaths(state, dead);

  state.towers = state.towers.filter((tower) => tower.hp > 0);
  for (const beam of state.beams) beam.life -= dt;
  state.beams = state.beams.filter((beam) => beam.life > 0);

  if (state.fever > 0) state.fever = Math.max(0, state.fever - dt);

  if (state.phase !== 'wave') return;

  // Losing the last pip ends the case whatever else happened this step, including on the wave
  // that would otherwise have cleared it.
  if (state.tissue <= 0) {
    state.phase = 'done';
    state.result = 'lost';
    return;
  }
  if (state.queue.length === 0 && state.enemies.length === 0) endWave(state);
}
