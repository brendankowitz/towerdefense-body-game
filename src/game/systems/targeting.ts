import { PATHOGENS } from '../content/pathogens';
import { IMMUNITY_MAX } from '../content/rules';
import { distance } from '../state';
import type { Enemy, SimState, Tower } from '../types';

export function isTagged(enemy: Enemy): boolean {
  return enemy.tag > 0;
}

/**
 * Armour applies unless the enemy is tagged and taggable, or the Biofilm serum is held —
 * an earned vaccine that changed nothing was the same broken promise as an unreachable one
 * (decision D22). Resistant strains are untaggable, so their armour is otherwise permanent.
 */
export function armourMultiplier(state: SimState, enemy: Enemy): number {
  const stats = PATHOGENS[enemy.kind];
  if (stats.armour === undefined) return 1;
  if (enemy.kind === 'film' && state.immunity.film >= IMMUNITY_MAX) return 1;
  if (isTagged(enemy) && stats.noTag !== true) return 1;
  return stats.armour;
}

export function inRange(tower: Tower, enemy: Enemy, range: number): boolean {
  return distance(tower.x, tower.y, enemy.x, enemy.y) <= range;
}

export function isAlive(enemy: Enemy, dead: ReadonlySet<number>): boolean {
  return enemy.hp > 0 && !dead.has(enemy.id);
}

/** The enemy furthest along the vessel — what phagocytes and memory cells pick. */
export function pickLeader(
  state: SimState,
  tower: Tower,
  range: number,
  dead: ReadonlySet<number>,
  exclude?: ReadonlySet<number>,
): Enemy | null {
  let best: Enemy | null = null;
  for (const enemy of state.enemies) {
    if (!isAlive(enemy, dead)) continue;
    if (exclude?.has(enemy.id) === true) continue;
    if (!inRange(tower, enemy, range)) continue;
    if (best === null || enemy.distance > best.distance) best = enemy;
  }
  return best;
}

/** The lowest health fraction in range — what the killer cell picks. Ties keep the first found. */
export function pickMostWounded(
  state: SimState,
  tower: Tower,
  range: number,
  dead: ReadonlySet<number>,
): Enemy | null {
  let best: Enemy | null = null;
  let bestFraction = Number.POSITIVE_INFINITY;
  for (const enemy of state.enemies) {
    if (!isAlive(enemy, dead)) continue;
    if (!inRange(tower, enemy, range)) continue;
    const fraction = enemy.hp / enemy.maxHp;
    if (fraction < bestFraction) {
      bestFraction = fraction;
      best = enemy;
    }
  }
  return best;
}
