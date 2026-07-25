export type DefenderKind = 'phago' | 'clot' | 'anti' | 'nk' | 'mast' | 'mem';
export type PathogenKind = 'staph' | 'film' | 'virus' | 'spore' | 'toxin' | 'mrsa';
export type CaseId = 'forearm' | 'throat' | 'stomach';
export type CaseRuleKind = 'wound' | 'virus' | 'poison';

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
