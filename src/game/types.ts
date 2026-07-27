export type DefenderKind = 'phago' | 'clot' | 'anti' | 'nk' | 'mast' | 'mem';
export type PathogenKind = 'staph' | 'film' | 'virus' | 'spore' | 'toxin' | 'mrsa';
export type CaseId = 'forearm' | 'throat' | 'stomach' | 'hand';
export type CaseRuleKind = 'wound' | 'virus' | 'poison' | 'dormant';

/** A strain the immunity screen tracks. Every member has exactly one vaccine and one case that credits it. */
export type StrainId = 'staph' | 'virus' | 'film';

export type Tier = 1 | 2 | 3;

export type BodyNodeId =
  | 'sinus' | 'throat' | 'lungL' | 'lungR' | 'heart' | 'stomach' | 'gut'
  | 'shoulder' | 'forearm' | 'shoulderR' | 'handR'
  | 'kneeL' | 'kneeR' | 'footL' | 'footR';

/**
 * The canonical role vocabulary. src/game must never depend on src/theme (enforced by
 * lint), so the names live here and src/theme imports them to map each role to a colour.
 * Content stores a token name; the renderer is the one place that resolves it.
 */
export type PaletteToken =
  | 'threat' | 'frontline' | 'support' | 'control' | 'energy'
  | 'execute' | 'burst' | 'learn'
  | 'armoured' | 'splitter' | 'fungal' | 'chemical' | 'resistant'
  | 'fever' | 'notReached' | 'vesselCasing' | 'vesselLumen' | 'tissueField' | 'core';

export type Point = readonly [x: number, y: number];

export type Phase = 'build' | 'wave' | 'built' | 'done';
export type ResultKind = 'wave' | 'case' | 'lost';

export interface Segment {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly length: number;
  /** Arc length at which this segment begins. */
  readonly start: number;
}

export interface CompiledPath {
  /** Non-empty by construction, so walking a path never needs an emptiness guard. */
  readonly segments: readonly [Segment, ...Segment[]];
  readonly total: number;
}

interface TowerBase {
  readonly spotIndex: number;
  readonly x: number;
  readonly y: number;
  hp: number;
  stun: number;
  /**
   * Whether this cell has been grown into its named matured form. A tier on the cell rather
   * than a kind of its own: a macrophage is a matured monocyte, same lineage, so `kind` never
   * changes and nothing that switches over the union gains a case (spec §5 naming policy).
   * Which stats the tier moves lives in `content/defenders.ts`; `systems/stats.ts` resolves it.
   */
  matured: boolean;
}

export interface PhagocyteTower extends TowerBase {
  readonly kind: 'phago';
  holdingEnemyId: number | null;
  /**
   * Health this cell has broken down since its last full rest. Damage it dealt itself, so a body
   * something else finished still counts for the part this cell chewed. Reaching the kind's
   * `capacity` buys the long `rest` and empties this back to zero.
   */
  digested: number;
  rest: number;
}
export interface ClotTower extends TowerBase {
  readonly kind: 'clot';
}
export interface AntibodyTower extends TowerBase {
  readonly kind: 'anti';
  cooldown: number;
}
export interface NkTower extends TowerBase {
  readonly kind: 'nk';
  cooldown: number;
}
export interface MastTower extends TowerBase {
  readonly kind: 'mast';
  cooldown: number;
  flash: number;
}
export interface MemoryTower extends TowerBase {
  readonly kind: 'mem';
  cooldown: number;
  xp: number;
}

export type Tower =
  | PhagocyteTower
  | ClotTower
  | AntibodyTower
  | NkTower
  | MastTower
  | MemoryTower;

export interface Enemy {
  readonly id: number;
  readonly kind: PathogenKind;
  /** Arc length travelled along the compiled path. */
  distance: number;
  x: number;
  y: number;
  hp: number;
  readonly maxHp: number;
  /** Seconds of tag remaining. Zero or less means untagged. */
  tag: number;
  /**
   * 0 for an original, 1 for a split child, 2 for something a dormancy case woke back up.
   *
   * Both of the things that put a body back on the vessel are keyed off this, and both only ever
   * act on a 0 — so a child never splits, a revenant never wakes twice, and neither chain can run
   * away. It is also what tells a split child from a revenant, which move at different speeds.
   */
  readonly generation: 0 | 1 | 2;
}

/**
 * Something a dormancy case killed that is coming back. Scheduled where it fell rather than at the
 * entry, which is the whole of what the rule does to a board: ground you cleared is not held.
 */
export interface Dormant {
  readonly kind: PathogenKind;
  /** Arc length along the path where it died, and where it will wake. */
  readonly distance: number;
  readonly hp: number;
  /** Seconds left before it wakes. */
  delay: number;
}

export interface Beam {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  life: number;
  readonly source: 'anti' | 'nk' | 'mem';
}

export interface SimState {
  readonly caseId: CaseId;
  readonly rule: CaseRuleKind;
  readonly path: CompiledPath;
  /** Profile facts the simulation reads but never writes. */
  readonly immunity: Readonly<Record<StrainId, number>>;
  readonly clearedCount: number;

  phase: Phase;
  result: ResultKind | null;
  waveIndex: number;
  readonly waveCount: number;

  energy: number;
  tissue: number;
  selected: DefenderKind | null;
  fast: boolean;

  fever: number;
  feverUsed: boolean;

  queue: PathogenKind[];
  spawnTimer: number;
  /**
   * The wave index whose tetanus bounce has already been spent. Lives here rather than on a
   * loop instance so replaying a case restores the shield (spec §5.1, decision D2).
   */
  shieldedWave: number | null;
  bleedTimer: number;

  towers: Tower[];
  enemies: Enemy[];
  /**
   * What the dormancy rule has killed and not finished with. Empty on every other case, and empty
   * at the end of every wave — `step` will not hold a wave as over while anything is still down
   * there, which is the difference between a relapse and a spawn in the next wave.
   */
  dormant: Dormant[];
  beams: Beam[];
  nextEnemyId: number;
  rngState: number;

  waveKills: number;
  waveLeaks: number;
  totalKills: number;
}
