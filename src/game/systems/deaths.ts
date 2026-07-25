import type { SimState } from '../types';

export function resolveDeaths(state: SimState, dead: ReadonlySet<number>): void {
  if (dead.size === 0) return;
  state.enemies = state.enemies.filter((enemy) => !dead.has(enemy.id));
}
