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

/**
 * Clots are inert and the memory cell's stated perk is toxin immunity. Everything else stuns.
 * Note the exemption list here is deliberately *wider* than `applyPoison`'s — see decision D8.
 */
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

/**
 * Poison cases damage defenders directly. Antibodies resist far better; only the inert clot is
 * exempt.
 *
 * Decision D8, deliberate asymmetry: the memory cell escapes `applyToxinStun` but is damaged
 * here. Stun resistance is its stated perk — "toxins cannot stun it" — whereas the poison case
 * rule harms every living cell. Exempting it from poison too would make Learn strictly dominant
 * in the stomach case.
 *
 * Decision D25: this runs once per enemy in range, so a crowd poisons proportionally — the same
 * shape as D10's clot wear, in the same step loop, and kept for the same reason. Two case rules
 * pricing a crowd differently would be the real inconsistency.
 *
 * It is kept on measurement rather than on principle. Repricing it flat moves stomach's clear
 * rate from 5.5% to 6.5% — past throat's 6.3%, which inverts the season's difficulty curve and
 * fails the sweep's monotonic assertion. Capping the crowd buys nothing, because the crowd never
 * gets large: across the whole board space a cell is inside `POISON_RADIUS` on 3.7% of
 * cell-steps, the mean crowd when exposed is 1.16, and the largest ever observed is 4.
 *
 * Unlike D10 this earns no brief copy. Every clot in the stomach case dies to wear, so the crowd
 * is that cell's whole story; poison at a mean crowd of 1.16 is not, and the rule line already
 * says what matters — antibodies survive toxins far better than phagocytes.
 */
export function applyPoison(state: SimState, enemy: Enemy, dt: number): void {
  if (state.rule !== 'poison') return;

  for (const tower of state.towers) {
    if (tower.kind === 'clot') continue;
    if (distance(tower.x, tower.y, enemy.x, enemy.y) < POISON_RADIUS) {
      tower.hp -= (tower.kind === 'anti' ? POISON_DPS_ANTIBODY : POISON_DPS_OTHER) * dt;
    }
  }
}
