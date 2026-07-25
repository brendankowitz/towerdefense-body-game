import { DEFENDERS } from '../content/defenders';
import type { SimState } from '../types';
import { pickLeader } from './targeting';

/**
 * Phagocyte grabs, as their own pass. `step` calls this before movement so an enemy is frozen
 * on the very step it is engulfed — the prototype grabbed inside the defender pass, after
 * movement, so a newly held enemy slid one extra step (decision D9, spec §5.1).
 */
export function acquireHolds(state: SimState, held: Set<number>, dead: ReadonlySet<number>): void {
  for (const tower of state.towers) {
    if (tower.kind !== 'phago') continue;
    if (tower.stun > 0 || tower.rest > 0 || tower.holdingEnemyId !== null) continue;

    const prey = pickLeader(state, tower, DEFENDERS.phago.range, dead, held);
    if (prey === null) continue;

    tower.holdingEnemyId = prey.id;
    held.add(prey.id);
  }
}

/**
 * The shared defender gate: a stunned cell does nothing this step. The per-kind work — digest,
 * tag, execute, burst, learn — lands in Phases 5 and 6, which also add the `dead` set the
 * damaging branches need. Acquisition deliberately does not live here; see `acquireHolds`.
 */
export function runDefenders(state: SimState, dt: number): void {
  for (const tower of state.towers) {
    if (tower.stun > 0) {
      tower.stun -= dt;
      continue;
    }

    switch (tower.kind) {
      case 'phago':
        if (tower.rest > 0) tower.rest -= dt;
        break;
      case 'clot':
        break; // Blocks and slows. Handled in movement; deals no damage at all.
      case 'anti':
      case 'nk':
      case 'mast':
      case 'mem':
        break;
    }
  }
}
