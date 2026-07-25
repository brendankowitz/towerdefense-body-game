import { DEFENDERS } from '../content/defenders';
import { PATHOGENS } from '../content/pathogens';
import { FEVER_SLOW, SPLIT_SPEED_FACTOR } from '../content/rules';
import { positionAt } from '../path';
import { distance } from '../state';
import type { SimState } from '../types';
import { applyPoison, applyToxinStun } from './hazards';

export function applyMovement(
  state: SimState,
  dt: number,
  held: ReadonlySet<number>,
  dead: Set<number>,
): void {
  const globalSlow = state.fever > 0 ? FEVER_SLOW : 1;

  for (const enemy of state.enemies) {
    const stats = PATHOGENS[enemy.kind];
    [enemy.x, enemy.y] = positionAt(state.path, enemy.distance);

    if (enemy.tag > 0) {
      enemy.tag -= dt;
      enemy.hp -= DEFENDERS.anti.dot * dt;
    }
    if (stats.regen !== undefined && enemy.tag <= 0) {
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + stats.regen * dt);
    }

    let speedFactor = held.has(enemy.id) ? 0 : globalSlow;
    for (const tower of state.towers) {
      if (tower.kind !== 'clot') continue;
      if (distance(tower.x, tower.y, enemy.x, enemy.y) < DEFENDERS.clot.range) {
        speedFactor = Math.min(speedFactor, DEFENDERS.clot.slow);
        // Deliberate (D10): wear is per body, so a crowded clot buckles fast.
        tower.hp -= DEFENDERS.clot.wear * dt;
      }
    }

    const generationFactor = enemy.generation === 1 ? SPLIT_SPEED_FACTOR : 1;
    enemy.distance += stats.speed * generationFactor * speedFactor * dt;
    [enemy.x, enemy.y] = positionAt(state.path, enemy.distance);

    if (enemy.distance >= state.path.total) {
      // Deliberate (D11): a leak is marked dead here, before the death pass, so it pays no
      // bounty and adds no kill. It still stuns and still poisons on the step it gets through.
      dead.add(enemy.id);
      state.tissue -= 1;
      state.waveLeaks += 1;
    }

    applyToxinStun(state, enemy);
    applyPoison(state, enemy, dt);
  }
}
