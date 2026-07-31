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
import { applyInflammation, scheduleDormancy } from './hazards';
import { statsFor } from './stats';

/**
 * A splitter leaves weaker copies strung out behind where it fell — unless the flu's own vaccine
 * is complete, which suppresses the flu's split outright, the same way the Biofilm serum
 * suppresses the biofilm's armour. A child never splits again, so `generation` bounds the chain
 * at one.
 *
 * **The suppression names the strain, the way `armourMultiplier` does.** It used to apply to
 * anything carrying `splits`, which was the same behaviour while the flu was the only splitter in
 * the table — and became a silent promotion the moment a second one was authored: a vaccine whose
 * copy says "Flu no longer splits when it dies" would have quietly stopped a Strep splitting too.
 * Strain-specific immunity is the whole idea the immunity screen is built on.
 *
 * The prototype (line 769) left a child without a position until the next movement pass. It is
 * computed here so the child is drawable on the frame it appears; movement overwrites it before
 * anything in the simulation reads it, so this changes no behaviour.
 */
function splitOnDeath(state: SimState, enemy: Enemy): void {
  const stats = PATHOGENS[enemy.kind];
  if (stats.splits !== true) return;
  if (enemy.generation !== 0) return;
  if (enemy.kind === 'virus' && state.immunity.virus >= IMMUNITY_MAX) return;

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
 * is swept off the board but pays no bounty, adds no kill, leaves no children and — on an allergy
 * case, where that is the difference between winning and losing — inflames nothing (decision D11).
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
    scheduleDormancy(state, enemy);
    applyInflammation(state);
  }

  if (dead.size === 0) return;

  state.enemies = state.enemies.filter((enemy) => !dead.has(enemy.id));

  // A phagocyte whose body is gone lets go and pauses. Which pause depends on how full it is,
  // not on how many bodies it has been through: the brief `gap` reads as swallowing, and a cell
  // that has broken down its whole capacity takes the long `rest` and starts empty again. A cell
  // is never interrupted mid-body — it finishes what it is holding, then finds out it is full.
  for (const tower of state.towers) {
    if (tower.kind !== 'phago') continue;
    if (tower.holdingEnemyId === null || !dead.has(tower.holdingEnemyId)) continue;

    const stats = statsFor(tower);
    tower.holdingEnemyId = null;
    const full = tower.digested >= stats.capacity;
    if (full) tower.digested = 0;
    tower.rest = full ? stats.rest : stats.gap;
  }
}
