import { CASE_BY_ID } from './content/cases';
import { DEFENDERS, DEFENDER_ORDER } from './content/defenders';
import { maturedFormOf, type MaturedForm } from './content/maturation';
import {
  FEVER_DURATION, REABSORB_REFUND, SPAWN_FIRST_DELAY, TOWER_MAX_HP,
} from './content/rules';
import { DEFAULT_SELECTION, createSimState } from './state';
import { buildQueue } from './systems/spawn';
import { maturationOffer } from './systems/stats';
import type { DefenderKind, Phase, SimState, Tower } from './types';

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
  const base = { spotIndex, x, y, hp: TOWER_MAX_HP, stun: 0, matured: false };
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

/**
 * When the board may be rearranged. Reabsorbing and maturing both answer to this: a cell
 * pulled out mid-wave would be free to farm and replace, which is not a decision either.
 *
 * Takes the phase rather than the state so the HUD snapshot satisfies it too — the rule is
 * stated once and the chrome cannot drift out of step with what the commands will accept.
 */
export function isBuildPhase(state: { readonly phase: Phase }): boolean {
  return state.phase === 'build' || state.phase === 'built';
}

export function towerAt(state: SimState, spotIndex: number): Tower | null {
  return state.towers.find((tower) => tower.spotIndex === spotIndex) ?? null;
}

/** Everything paid for this cell so far: its placement, plus its maturation if it was grown. */
function totalSpent(tower: Tower): number {
  const form = tower.matured ? maturedFormOf(tower.kind) : null;
  return DEFENDERS[tower.kind].cost + (form?.cost ?? 0);
}

/**
 * The refund rule on its own. Whole units only, and never more than went in: energy is spent
 * and displayed in whole units everywhere else, so a refund fraction that lands off one would
 * otherwise leave a fractional balance behind the moment a cost is retuned.
 */
export function refundOf(spent: number): number {
  return Math.floor(spent * REABSORB_REFUND);
}

/** What the body gets back for reabsorbing this cell. */
export function reabsorbValue(tower: Tower): number {
  return refundOf(totalSpent(tower));
}

/** The form the cell on this spot can still be grown into, or null. */
export function maturationAt(state: SimState, spotIndex: number): MaturedForm | null {
  const tower = towerAt(state, spotIndex);
  return tower === null ? null : maturationOffer(tower);
}

/** Returns true when a cell was actually taken back. Build phase only. */
export function reabsorbDefender(state: SimState, spotIndex: number): boolean {
  if (!isBuildPhase(state)) return false;

  const index = state.towers.findIndex((tower) => tower.spotIndex === spotIndex);
  const tower = state.towers[index];
  if (tower === undefined) return false;

  state.towers.splice(index, 1);
  state.energy += reabsorbValue(tower);
  return true;
}

/** Returns true when a cell was actually grown. Build phase only, and only ever once. */
export function matureDefender(state: SimState, spotIndex: number): boolean {
  if (!isBuildPhase(state)) return false;

  const tower = towerAt(state, spotIndex);
  if (tower === null) return false;

  const form = maturationOffer(tower);
  if (form === null) return false;
  if (state.energy < form.cost) return false;

  tower.matured = true;
  state.energy -= form.cost;
  return true;
}

export function startWave(state: SimState): void {
  if (!isBuildPhase(state)) return;

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
