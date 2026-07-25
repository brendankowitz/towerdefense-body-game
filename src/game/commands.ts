import { CASE_BY_ID } from './content/cases';
import { DEFENDERS, DEFENDER_ORDER } from './content/defenders';
import { FEVER_DURATION, SPAWN_FIRST_DELAY, TOWER_MAX_HP } from './content/rules';
import { buildQueue } from './systems/spawn';
import type { DefenderKind, SimState, Tower } from './types';

export function isUnlocked(state: SimState, kind: DefenderKind): boolean {
  return state.clearedCount >= DEFENDERS[kind].unlock;
}

export function unlockedDefenders(state: SimState): readonly DefenderKind[] {
  return DEFENDER_ORDER.filter((kind) => isUnlocked(state, kind));
}

export function selectDefender(state: SimState, kind: DefenderKind): void {
  if (!isUnlocked(state, kind)) return;
  state.selected = state.selected === kind ? null : kind;
}

function createTower(kind: DefenderKind, spotIndex: number, x: number, y: number): Tower {
  const base = { spotIndex, x, y, hp: TOWER_MAX_HP, stun: 0 };
  switch (kind) {
    case 'phago': return { ...base, kind, holdingEnemyId: null, eaten: 0, rest: 0 };
    case 'clot': return { ...base, kind };
    case 'anti': return { ...base, kind, cooldown: 0 };
    case 'nk': return { ...base, kind, cooldown: 0 };
    case 'mast': return { ...base, kind, cooldown: 0, flash: 0 };
    case 'mem': return { ...base, kind, cooldown: 0, xp: 0 };
  }
}

/** Returns true when a defender was actually placed. */
export function placeDefender(state: SimState, spotIndex: number): boolean {
  const kind = state.selected;
  if (kind === null) return false;

  const spot = CASE_BY_ID[state.caseId].spots[spotIndex];
  if (spot === undefined) return false;
  if (state.towers.some((tower) => tower.spotIndex === spotIndex)) return false;

  const stats = DEFENDERS[kind];
  if (state.energy < stats.cost) return false;

  state.towers.push(createTower(kind, spotIndex, spot[0], spot[1]));
  state.energy -= stats.cost;
  return true;
}

export function startWave(state: SimState): void {
  if (state.phase !== 'build' && state.phase !== 'built') return;

  state.queue = buildQueue(state);
  state.spawnTimer = SPAWN_FIRST_DELAY;
  state.phase = 'wave';
  state.selected = null;
  state.fever = 0;
  state.feverUsed = false;
  state.waveKills = 0;
  state.waveLeaks = 0;
  state.result = null;
}

/** Named triggerFever, not useFever: a `use` prefix reads as a React hook to eslint. */
export function triggerFever(state: SimState): void {
  if (state.feverUsed || state.phase !== 'wave') return;
  state.fever = FEVER_DURATION;
  state.feverUsed = true;
}

export function toggleSpeed(state: SimState): void {
  state.fast = !state.fast;
}
