import { PATHOGENS } from './content/pathogens';
import { TOWER_MAX_HP } from './content/rules';
import { positionAt } from './path';
import { createSimState } from './state';
import type { CaseId, DefenderKind, Enemy, PathogenKind, SimState, StrainId, Tower } from './types';

/**
 * Fixture builders shared by the simulation tests. Lives in src/game so it obeys the same
 * no-DOM, no-framework rule as the code it builds state for.
 */

export function simFor(
  caseId: CaseId = 'forearm',
  overrides: {
    immunity?: Partial<Record<StrainId, number>>; day?: number;
  } = {},
): SimState {
  const state = createSimState({
    caseId,
    immunity: { staph: 0, film: 0, virus: 0, ...overrides.immunity },
    day: overrides.day ?? 3,
    totalKills: 0,
  });
  state.phase = 'wave';
  state.selected = null;
  return state;
}

export function addEnemy(
  state: SimState,
  kind: PathogenKind,
  opts: {
    x?: number; y?: number; hp?: number; tag?: number; distance?: number;
    generation?: Enemy['generation'];
  } = {},
): Enemy {
  const stats = PATHOGENS[kind];
  const travelled = opts.distance ?? 0;
  const [pathX, pathY] = positionAt(state.path, travelled);
  const enemy: Enemy = {
    id: state.nextEnemyId,
    kind,
    distance: travelled,
    x: opts.x ?? pathX,
    y: opts.y ?? pathY,
    hp: opts.hp ?? stats.hp,
    maxHp: stats.hp,
    tag: opts.tag ?? 0,
    generation: opts.generation ?? 0,
  };
  state.nextEnemyId += 1;
  state.enemies.push(enemy);
  return enemy;
}

interface TowerBase {
  readonly spotIndex: number;
  readonly x: number;
  readonly y: number;
  hp: number;
  stun: number;
  matured: boolean;
}

const TOWER_BUILDERS: { [K in DefenderKind]: (base: TowerBase) => Extract<Tower, { kind: K }> } = {
  phago: (base) => ({ ...base, kind: 'phago', holdingEnemyId: null, digested: 0, rest: 0 }),
  clot: (base) => ({ ...base, kind: 'clot' }),
  anti: (base) => ({ ...base, kind: 'anti', cooldown: 0 }),
  nk: (base) => ({ ...base, kind: 'nk', cooldown: 0 }),
  mast: (base) => ({ ...base, kind: 'mast', cooldown: 0, flash: 0 }),
  mem: (base) => ({ ...base, kind: 'mem', cooldown: 0, xp: 0 }),
};

/** Returns the concrete tower type for the kind asked for, so tests never cast the union. */
export function addTower<K extends DefenderKind>(
  state: SimState,
  kind: K,
  spotIndex: number,
  x = 0,
  y = 0,
  matured = false,
): Extract<Tower, { kind: K }> {
  const tower = TOWER_BUILDERS[kind]({ spotIndex, x, y, hp: TOWER_MAX_HP, stun: 0, matured });
  state.towers.push(tower);
  return tower;
}

/** Places a tower directly on the vessel, so anything at `travelled` is inside its reach. */
export function addTowerOnPath<K extends DefenderKind>(
  state: SimState,
  kind: K,
  travelled: number,
  matured = false,
): Extract<Tower, { kind: K }> {
  const [x, y] = positionAt(state.path, travelled);
  return addTower(state, kind, state.towers.length, x, y, matured);
}
