import type { Enemy, PathogenKind, SimState, StrainId } from './types';

/**
 * The pathogen this enemy belongs to, if the immunity screen tracks it at all. `PathogenKind` and
 * `StrainId` overlap on exactly three members, and `state.immunity`'s own keys are that overlap —
 * so this reads them rather than repeating the three names in a table of its own. A pollen or a
 * toxin is not a key `state.immunity` has, and is not a strain for the same reason it was never a
 * vaccine: nobody was ever asked to beat it three times.
 */
function strainOf(state: SimState, kind: PathogenKind): StrainId | undefined {
  return kind in state.immunity ? (kind as StrainId) : undefined;
}

/**
 * What a freshly laid mark earns: one recognition banked against the strain it belongs to.
 *
 * Called from the antibody's `tag` pass at the point a mark is actually laid, never at the point
 * one is attempted — a body already carrying a mark counts nothing there because refreshing a mark
 * is not a new recognition.
 *
 * Reading `state.immunity` is the whole of "no memory, no secondary response": a strain sitting at
 * zero contributes nothing here, with no separate rule saying so. The same read is what lets an
 * amnesia case's mask do its work — `createSimState` zeroes the wiped strain in `state.immunity`
 * before this ever runs, so help for that strain stops arriving without this function knowing the
 * rule exists.
 *
 * Kept per strain and never reset here, the way `state.inflammation` is never reset — a running
 * total of the response, not of a wave.
 */
export function noteRecognition(state: SimState, enemy: Enemy): void {
  const strain = strainOf(state, enemy.kind);
  if (strain === undefined) return;
  if (state.immunity[strain] <= 0) return;

  state.recognition[strain] = (state.recognition[strain] ?? 0) + 1;
}
