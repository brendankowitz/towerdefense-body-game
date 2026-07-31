import { CASE_BY_ID } from './content/cases';
import { TISSUE_PIPS } from './content/rules';
import { compilePath } from './path';
import type { CaseId, CaseRuleKind, DefenderKind, SimState, StrainId } from './types';

/** What the dock offers before the player has chosen anything — on a new case and on a new wave. */
export const DEFAULT_SELECTION: DefenderKind = 'phago';

export interface SimInput {
  readonly caseId: CaseId;
  readonly immunity: Readonly<Record<StrainId, number>>;
  readonly clearedCount: number;
  readonly totalKills: number;
}

/**
 * The amnesia rule, and the whole of it: one strain the profile earned reads as zero for the
 * length of this case.
 *
 * Applied here rather than at each of the three places an immunity is read — the tetanus bounce in
 * `applySpawn`, the suppressed split in `splitOnDeath`, the dropped armour in `armourMultiplier`.
 * Those are the ones that exist today; the point of masking at the boundary is that the fourth one
 * somebody adds is wiped too, without knowing the rule is there. It also keeps `SimState.immunity`
 * honest as "what this case's simulation is entitled to", which is what every reader already
 * assumes it means.
 *
 * The profile is not touched. A wipe that outlived the case would be a save-game change, and the
 * fiction is that the memory comes back — measles takes the immunity for the illness, not forever.
 */
function immunityFor(
  immunity: Readonly<Record<StrainId, number>>,
  wipes: StrainId | undefined,
): Readonly<Record<StrainId, number>> {
  return wipes === undefined ? immunity : { ...immunity, [wipes]: 0 };
}

/**
 * Whether this case is played under a given rule.
 *
 * Every hazard asks this rather than comparing a field, which is what lets a case carry two rules
 * without either hazard knowing the other exists. Stated here beside `createSimState` because this
 * is where a case's rules become a simulation's, and takes the narrowest shape it can so a HUD
 * snapshot or a test fixture can be asked the same question as a live state.
 */
export function hasRule(state: { readonly rules: readonly CaseRuleKind[] }, kind: CaseRuleKind): boolean {
  return state.rules.includes(kind);
}

export function createSimState(input: SimInput): SimState {
  const definition = CASE_BY_ID[input.caseId];
  return {
    caseId: definition.id,
    rules: definition.rules.map((rule) => rule.kind),
    path: compilePath(definition.path),
    immunity: immunityFor(input.immunity, definition.wipes),
    clearedCount: input.clearedCount,

    phase: 'build',
    result: null,
    waveIndex: 0,
    waveCount: definition.waves.length,

    energy: definition.startingEnergy,
    tissue: TISSUE_PIPS,
    selected: DEFAULT_SELECTION,
    fast: false,

    fever: 0,
    feverUsed: false,

    queue: [],
    spawnTimer: 0,
    shieldedWave: null,
    bleedTimer: 0,
    inflammation: 0,

    towers: [],
    enemies: [],
    dormant: [],
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
