import { DEFENDERS } from '../content/defenders';
import { PATHOGENS } from '../content/pathogens';
import { TAG_REWARD_MULTIPLIER } from '../content/rules';
import { distance } from '../state';
import type { Enemy, SimState } from '../types';
import { isTagged } from './targeting';

/** Energy for a kill, raised while the target was tagged. Rounded so the HUD reads a whole number. */
export function awardKill(state: SimState, enemy: Enemy): void {
  const reward = PATHOGENS[enemy.kind].reward;
  state.energy += Math.round(reward * (isTagged(enemy) ? TAG_REWARD_MULTIPLIER : 1));
  state.waveKills += 1;
  state.totalKills += 1;
}

/** Every memory cell within reach of the kill learns from it, permanently, up to its cap. */
export function grantMemoryXp(state: SimState, enemy: Enemy): void {
  const stats = DEFENDERS.mem;
  for (const tower of state.towers) {
    if (tower.kind !== 'mem') continue;
    if (distance(tower.x, tower.y, enemy.x, enemy.y) > stats.range) continue;

    tower.xp = Math.min(stats.cap, tower.xp + stats.learn);
  }
}
