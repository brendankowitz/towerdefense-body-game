import { CASE_BY_ID } from './content/cases';
import { DEFENDERS, DEFENDER_ORDER } from './content/defenders';
import { FEVER_DURATION, SPAWN_FIRST_DELAY, TOWER_MAX_HP } from './content/rules';
import { DEFAULT_SELECTION, createSimState } from './state';
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

/**
 * "Next wave" from the result sheet. Only a held wave has a next one — a finished case is over,
 * and a running wave has not been held yet. Unspent energy carries over untouched.
 */
export function advanceToNextWave(state: SimState): void {
  if (state.phase !== 'built') return;

  state.waveIndex += 1;
  state.phase = 'build';
  state.result = null;
  state.selected = DEFAULT_SELECTION;
}

/** "Try this case again" — a fresh board, keeping nothing but what the profile already holds. */
export function restartCase(state: SimState): SimState {
  return createSimState({
    caseId: state.caseId,
    immunity: state.immunity,
    clearedCount: state.clearedCount,
    totalKills: state.totalKills,
  });
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
