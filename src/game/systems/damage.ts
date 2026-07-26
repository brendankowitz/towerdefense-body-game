import { PATHOGENS } from '../content/pathogens';
import { TAGGED_BURST_MULTIPLIER } from '../content/rules';
import type {
  AntibodyTower, MastTower, MemoryTower, NkTower, PhagocyteTower, SimState,
} from '../types';
import { statsFor } from './stats';
import {
  armourMultiplier, inRange, isAlive, isTagged, pickLeader, pickMostWounded,
} from './targeting';

/**
 * Phagocyte grabs, as their own pass. `step` calls this before movement so an enemy is frozen
 * on the very step it is engulfed — the prototype grabbed inside the defender pass, after
 * movement, so a newly held enemy slid one extra step (decision D9, spec §5.1).
 */
export function acquireHolds(state: SimState, held: Set<number>, dead: ReadonlySet<number>): void {
  for (const tower of state.towers) {
    if (tower.kind !== 'phago') continue;
    if (tower.stun > 0 || tower.rest > 0 || tower.holdingEnemyId !== null) continue;

    const prey = pickLeader(state, tower, statsFor(tower).range, dead, held);
    if (prey === null) continue;

    tower.holdingEnemyId = prey.id;
    held.add(prey.id);
  }
}

/** One meal at a time, digested where it stands. Acquisition already happened in `acquireHolds`. */
function engulf(state: SimState, tower: PhagocyteTower, dt: number): void {
  if (tower.rest > 0) {
    tower.rest -= dt;
    return;
  }
  if (tower.holdingEnemyId === null) return;

  const prey = state.enemies.find((enemy) => enemy.id === tower.holdingEnemyId);
  if (prey === undefined) {
    tower.holdingEnemyId = null;
    return;
  }

  prey.hp -= statsFor(tower).dps * armourMultiplier(state, prey) * dt;
}

/** Marks everything in reach at once. A tag strips armour, burns, and pays more on the kill. */
function tag(state: SimState, tower: AntibodyTower, dt: number, dead: ReadonlySet<number>): void {
  const stats = statsFor(tower);
  tower.cooldown -= dt;
  if (tower.cooldown > 0) return;

  let tagged = false;
  for (const enemy of state.enemies) {
    if (!isAlive(enemy, dead)) continue;
    if (!inRange(tower, enemy, stats.range)) continue;
    if (PATHOGENS[enemy.kind].noTag === true) continue;

    enemy.tag = stats.tag;
    tagged = true;
    state.beams.push({
      fromX: tower.x, fromY: tower.y, toX: enemy.x, toY: enemy.y, life: 0.2, source: 'anti',
    });
  }

  if (tagged) tower.cooldown = stats.rate;
}

/** One heavy hit on the most wounded thing in reach, and a clean finish below the threshold. */
function execute(state: SimState, tower: NkTower, dt: number, dead: ReadonlySet<number>): void {
  const stats = statsFor(tower);
  tower.cooldown -= dt;
  if (tower.cooldown > 0) return;

  const target = pickMostWounded(state, tower, stats.range, dead);
  if (target === null) return;

  const fraction = target.hp / target.maxHp;
  target.hp = fraction <= stats.execute ? 0 : target.hp - stats.dmg * armourMultiplier(state, target);
  tower.cooldown = stats.rate;
  state.beams.push({
    fromX: tower.x, fromY: tower.y, toX: target.x, toY: target.y, life: 0.22, source: 'nk',
  });
}

/** One pulse over everything in reach at once, landing harder on anything already tagged. */
function burst(state: SimState, tower: MastTower, dt: number, dead: ReadonlySet<number>): void {
  const stats = statsFor(tower);
  tower.cooldown -= dt;
  if (tower.cooldown > 0) return;

  let hitSomething = false;
  for (const enemy of state.enemies) {
    if (!isAlive(enemy, dead)) continue;
    if (!inRange(tower, enemy, stats.range)) continue;

    const bonus = isTagged(enemy) ? TAGGED_BURST_MULTIPLIER : 1;
    enemy.hp -= stats.dmg * bonus * armourMultiplier(state, enemy);
    hitSomething = true;
  }

  if (!hitSomething) return;
  tower.cooldown = stats.rate;
  tower.flash = 0.18;
}

/** Weak on its own, but every nearby kill is banked as `xp` and rides on every hit after it. */
function learn(state: SimState, tower: MemoryTower, dt: number, dead: ReadonlySet<number>): void {
  const stats = statsFor(tower);
  tower.cooldown -= dt;
  if (tower.cooldown > 0) return;

  const target = pickLeader(state, tower, stats.range, dead);
  if (target === null) return;

  target.hp -= (stats.dmg + tower.xp) * armourMultiplier(state, target);
  tower.cooldown = stats.rate;
  state.beams.push({
    fromX: tower.x, fromY: tower.y, toX: target.x, toY: target.y, life: 0.16, source: 'mem',
  });
}

/**
 * The defender action pass. A stunned cell does nothing this step. The switch is exhaustive so
 * a new defender kind cannot be silently forgotten.
 */
export function runDefenders(state: SimState, dt: number, dead: ReadonlySet<number>): void {
  for (const tower of state.towers) {
    if (tower.stun > 0) {
      tower.stun -= dt;
      continue;
    }

    switch (tower.kind) {
      case 'phago':
        engulf(state, tower, dt);
        break;
      case 'clot':
        // Blocks and slows. Handled in movement; deals no damage at all.
        break;
      case 'anti':
        tag(state, tower, dt, dead);
        break;
      case 'nk':
        execute(state, tower, dt, dead);
        break;
      case 'mast':
        burst(state, tower, dt, dead);
        break;
      case 'mem':
        learn(state, tower, dt, dead);
        break;
      default: {
        const unhandled: never = tower;
        throw new Error(`Unhandled defender kind: ${JSON.stringify(unhandled)}`);
      }
    }
  }
}
