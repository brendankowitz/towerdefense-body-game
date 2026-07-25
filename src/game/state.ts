import { CASE_BY_ID } from './content/cases';
import { TISSUE_PIPS } from './content/rules';
import { compilePath } from './path';
import type { CaseId, SimState, StrainId } from './types';

export interface SimInput {
  readonly caseId: CaseId;
  readonly immunity: Readonly<Record<StrainId, number>>;
  readonly clearedCount: number;
  readonly totalKills: number;
}

export function createSimState(input: SimInput): SimState {
  const definition = CASE_BY_ID[input.caseId];
  return {
    caseId: definition.id,
    rule: definition.rule,
    path: compilePath(definition.path),
    immunity: input.immunity,
    clearedCount: input.clearedCount,

    phase: 'build',
    result: null,
    waveIndex: 0,
    waveCount: definition.waves.length,

    energy: definition.startingEnergy,
    tissue: TISSUE_PIPS,
    selected: 'phago',
    fast: false,

    fever: 0,
    feverUsed: false,

    queue: [],
    spawnTimer: 0,
    shieldedWave: null,
    bleedTimer: 0,

    towers: [],
    enemies: [],
    beams: [],
    nextEnemyId: 1,
    rngState: 0,

    waveKills: 0,
    waveLeaks: 0,
    totalKills: input.totalKills,
  };
}

/** Math.hypot is spec-permitted to be approximated, which would make the golden run engine-dependent. */
export function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}
