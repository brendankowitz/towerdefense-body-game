import { PATHOGENS } from '../content/pathogens';
import {
  BLEED_AMOUNT,
  BLEED_INTERVAL,
  POISON_DPS_ANTIBODY,
  POISON_DPS_OTHER,
  POISON_RADIUS,
  TOXIN_STUN_RADIUS,
} from '../content/rules';
import { distance } from '../state';
import type { Enemy, SimState } from '../types';

/**
 * Wound cases bleed energy every second until a clot exists. Clamped here rather than in the
 * display, which is where the prototype clamped it while letting the value settle at −1
 * (decision D3).
 */
export function applyWoundBleed(state: SimState, dt: number): void {
  if (state.rule !== 'wound') return;
  if (state.towers.some((tower) => tower.kind === 'clot')) return;

  state.bleedTimer += dt;
  if (state.bleedTimer < BLEED_INTERVAL) return;

  state.bleedTimer = 0;
  state.energy = Math.max(0, state.energy - BLEED_AMOUNT);
}

/** Clots are inert and the memory cell's stated perk is toxin immunity. Everything else stuns. */
export function applyToxinStun(state: SimState, enemy: Enemy): void {
  const stun = PATHOGENS[enemy.kind].stun;
  if (stun === undefined) return;

  for (const tower of state.towers) {
    if (tower.kind === 'clot' || tower.kind === 'mem') continue;
    if (distance(tower.x, tower.y, enemy.x, enemy.y) < TOXIN_STUN_RADIUS) {
      tower.stun = Math.max(tower.stun, stun);
    }
  }
}

/** Poison cases damage defenders directly. Antibodies resist far better; only the clot is exempt. */
export function applyPoison(state: SimState, enemy: Enemy, dt: number): void {
  if (state.rule !== 'poison') return;

  for (const tower of state.towers) {
    if (tower.kind === 'clot') continue;
    if (distance(tower.x, tower.y, enemy.x, enemy.y) < POISON_RADIUS) {
      tower.hp -= (tower.kind === 'anti' ? POISON_DPS_ANTIBODY : POISON_DPS_OTHER) * dt;
    }
  }
}
