import { callArrivals, stepArrivals } from './arrivals';
import { ARRIVALS_ENABLED, WAVE_CLEAR_ENERGY } from './content/rules';
import { acquireHolds, runDefenders } from './systems/damage';
import { resolveDeaths } from './systems/deaths';
import { applyDormantWake, applyWoundBleed } from './systems/hazards';
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
 * The wave is held: nothing is queued, nothing is left on the board, and nothing is still lying
 * dormant waiting to get back up. The last wave of a case ends the case instead of paying a wave
 * bonus — the reward for that is banked by `clearCase`, and reporting the one that was actually
 * awarded is decision D5.
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
  // Beside spawning, not after movement: a revenant is on the board for the whole of the step it
  // wakes on, and is moved and shot at on that step like anything the queue put there.
  applyDormantWake(state, dt);
  applyWoundBleed(state, dt);

  const dead = new Set<number>();
  const held = collectHeld(state);
  acquireHolds(state, held, dead);

  applyMovement(state, dt, held, dead);
  runDefenders(state, dt, dead);

  // The single gate for the whole feature: every clear rate in cases.ts, and the golden
  // snapshot, were measured with this off, so a call for help and the arrival answering it stay
  // behind the one flag that turned them both on when it was time to measure what they are worth.
  if (ARRIVALS_ENABLED) {
    callArrivals(state);
    stepArrivals(state, dt);
  }

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
    // The region has fallen, so everything still in the vessel is through. Leaving them frozen
    // mid-stride under the result sheet reads as a wave that stopped early rather than a case
    // that ended — which is exactly how it was reported from play.
    state.enemies = [];
    state.dormant = [];
    state.beams = [];
    return;
  }
  if (state.queue.length === 0 && state.enemies.length === 0 && state.dormant.length === 0) {
    endWave(state);
  }
}
