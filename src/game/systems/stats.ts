import { DEFENDERS } from '../content/defenders';
import { maturedFormOf, type MaturedForm } from '../content/maturation';
import type { DefenderKind } from '../types';

/**
 * What a placed cell actually fights with.
 *
 * A matured cell keeps its kind — a macrophage is still a phagocyte — so nothing in the
 * simulation may read `DEFENDERS[kind]` for a cell that is standing on the board. Every system
 * that used to reach for the table directly goes through here instead, and both tables are read
 * at call time rather than at module load so the tuning panel's live edits still land.
 *
 * An unmatured cell gets the module table straight back, by identity: the base tier is not a
 * merge of anything, so nothing about a cell that has never been grown changed.
 *
 * A grown cell costs one small merge. Call it once per tower per step, never once per tower per
 * enemy: the one caller with a nested loop (`applyMovement`) hoists it out.
 */
type Stats<K extends DefenderKind> = (typeof DEFENDERS)[K];

/** The cell this one can still be grown into. Null once it is already there, or if it has none. */
export function maturationOffer(
  tower: { readonly kind: DefenderKind; readonly matured: boolean },
): MaturedForm | null {
  return tower.matured ? null : maturedFormOf(tower.kind);
}

export function statsFor<K extends DefenderKind>(
  tower: { readonly kind: K; readonly matured: boolean },
): Stats<K> {
  const base = DEFENDERS[tower.kind];
  if (!tower.matured) return base;

  const form = maturedFormOf(tower.kind);
  if (form === null) return base;

  return Object.assign({}, base, form.stats);
}
