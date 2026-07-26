import { PATHOGENS } from '../content/pathogens';
import {
  IMMUNITY_MAX,
  SPLIT_BACK_OFFSET,
  SPLIT_BACK_SPACING,
  SPLIT_COUNT,
  SPLIT_HP_FRACTION,
} from '../content/rules';
import { positionAt } from '../path';
import type { Enemy, SimState } from '../types';
import { awardKill, grantMemoryXp } from './economy';
import { statsFor } from './stats';

/**
 * A splitter leaves weaker copies strung out behind where it fell — unless the strain's vaccine
 * is complete, which suppresses the split outright, the same way the Biofilm serum suppresses
 * armour. A child never splits again, so `generation` bounds the chain at one.
 *
 * The prototype (line 769) left a child without a position until the next movement pass. It is
 * computed here so the child is drawable on the frame it appears; movement overwrites it before
 * anything in the simulation reads it, so this changes no behaviour.
 */
function splitOnDeath(state: SimState, enemy: Enemy): void {
  const stats = PATHOGENS[enemy.kind];
  if (stats.splits !== true) return;
  if (enemy.generation !== 0) return;
  if (state.immunity.virus >= IMMUNITY_MAX) return;

  const childHp = stats.hp * SPLIT_HP_FRACTION;
  for (let n = 0; n < SPLIT_COUNT; n += 1) {
    const back = SPLIT_BACK_OFFSET + n * SPLIT_BACK_SPACING;
    const childDistance = Math.max(0, enemy.distance - back);
    const [x, y] = positionAt(state.path, childDistance);

    state.enemies.push({
      id: state.nextEnemyId,
      kind: enemy.kind,
      distance: childDistance,
      x,
      y,
      hp: childHp,
      maxHp: childHp,
      tag: 0,
      generation: 1,
    });
    state.nextEnemyId += 1;
  }
}

/**
 * Pays out and clears the dead. Anything already in `dead` on entry leaked rather than died: it
 * is swept off the board but pays no bounty, adds no kill and leaves no children (decision D11).
 *
 * `for...of` over `state.enemies` visits elements appended during the loop, which is what lets
 * split children join the board here without escaping the filter below.
 */
export function resolveDeaths(state: SimState, dead: Set<number>): void {
  for (const enemy of state.enemies) {
    if (enemy.hp > 0 || dead.has(enemy.id)) continue;

    dead.add(enemy.id);
    awardKill(state, enemy);
    grantMemoryXp(state, enemy);
    splitOnDeath(state, enemy);
  }

  if (dead.size === 0) return;

  state.enemies = state.enemies.filter((enemy) => !dead.has(enemy.id));

  for (const tower of state.towers) {
    if (tower.kind !== 'phago') continue;
    if (tower.holdingEnemyId === null || !dead.has(tower.holdingEnemyId)) continue;

    const stats = statsFor(tower);
    tower.holdingEnemyId = null;
    tower.eaten += 1;
    tower.rest = tower.eaten % stats.streak === 0 ? stats.rest : stats.gap;
  }
}
