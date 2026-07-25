import { DEFENDERS } from '../content/defenders';
import type { SimState } from '../types';
import { awardKill, grantMemoryXp } from './economy';

/**
 * Pays out and clears the dead. Anything already in `dead` on entry leaked rather than died: it
 * is swept off the board but pays no bounty and adds no kill (decision D11).
 *
 * `for...of` over `state.enemies` visits elements appended during the loop, which is what lets
 * Phase 6's split children join the board here without escaping the filter below.
 */
export function resolveDeaths(state: SimState, dead: Set<number>): void {
  for (const enemy of state.enemies) {
    if (enemy.hp > 0 || dead.has(enemy.id)) continue;

    dead.add(enemy.id);
    awardKill(state, enemy);
    grantMemoryXp(state, enemy);
  }

  if (dead.size === 0) return;

  state.enemies = state.enemies.filter((enemy) => !dead.has(enemy.id));

  for (const tower of state.towers) {
    if (tower.kind !== 'phago') continue;
    if (tower.holdingEnemyId === null || !dead.has(tower.holdingEnemyId)) continue;

    tower.holdingEnemyId = null;
    tower.eaten += 1;
    tower.rest = tower.eaten % DEFENDERS.phago.streak === 0
      ? DEFENDERS.phago.rest
      : DEFENDERS.phago.gap;
  }
}
