import { CASE_BY_ID } from './content/cases';
import { DEFENDERS } from './content/defenders';
import { PATHOGENS } from './content/pathogens';
import { ARRIVAL_USES, RECOGNITION_PER_CALL, RESPONSE_PER_CLEAR } from './content/rules';
import { createRng } from './rng';
import { distance } from './state';
import { isTagged } from './systems/targeting';
import type { Arrival, Enemy, PathogenKind, SimState, StrainId } from './types';

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

/**
 * Strains in a fixed order, so which one's call is rolled first never depends on `Object.keys`
 * insertion order into `state.recognition` — the same discipline `front.ts`'s tiebreak keeps a
 * road-choice on, and for the same reason: a replay must not depend on it.
 */
const STRAINS: readonly StrainId[] = ['staph', 'virus', 'film'];

/** Mount indices nothing has landed on yet, in the case's own order. */
function openMounts(state: SimState): readonly number[] {
  const mounts = CASE_BY_ID[state.caseId].mounts;
  return mounts
    .map((_mount, index) => index)
    .filter((index) => !state.arrivals.some((arrival) => arrival.mountIndex === index));
}

/**
 * The call for help, and the roll behind it — `RECOGNITION_PER_CALL` is the whole of the pacing.
 * Below it, nothing is spent and nothing is rolled, the same discipline `seedOutbreak` (front.ts)
 * keeps for a day its own interval does not land on: a resource not yet worth a roll is not a roll
 * that quietly happened anyway.
 *
 * A free mount is checked before either is spent, for the reason `seedOutbreak` checks for a
 * candidate door before it draws: a roll only means something if it could land somewhere, and a
 * strain with every mount already answered has nowhere to send a call it makes. Recognition is left
 * banked rather than spent into nothing, so it is still there the moment a mount frees up.
 *
 * Sends only an antibody today. Which strain's memory earns a killer instead is Task 6's question,
 * not this one's — `Arrival.kind` exists so that choice has somewhere to land, but nothing here
 * reads `state.immunity` for anything but the chance a call is answered at all.
 */
export function callArrivals(state: SimState): void {
  for (const strain of STRAINS) {
    const banked = state.recognition[strain] ?? 0;
    if (banked < RECOGNITION_PER_CALL) continue;

    const free = openMounts(state);
    if (free.length === 0) continue;

    state.recognition[strain] = banked - RECOGNITION_PER_CALL;

    const rng = createRng(state.rngState);
    const mountIndex = free[Math.floor(rng.next() * free.length)];
    const answered = rng.next() < Math.min(1, state.immunity[strain] * RESPONSE_PER_CLEAR);
    state.rngState = rng.state;

    if (mountIndex === undefined || !answered) continue;
    state.arrivals.push({ mountIndex, kind: 'antibody', uses: ARRIVAL_USES });
  }
}

/**
 * What an arrival actually does, run from `step` the same pass the cells act in — so an arrival
 * and a cell can never disagree about the order of a frame.
 *
 * Marks with the same field and the same duration the placed cell uses, `DEFENDERS.anti.tag`, so
 * every downstream reader of `isTagged` — armour, the burn, the kill's reward — treats an
 * arrival's mark and a cell's mark as the one thing they are; this never invents a second kind.
 * Reach is the placed cell's own range for the same reason: an arrival is an antibody, not a rule
 * invented beside one.
 *
 * Ammunition, not a timer. Against a particulate target an antibody is internalised bound to what
 * it caught and degraded with it, so this spends one use per body it marks and the arrival leaves
 * the instant it has none left — nothing here runs down on a clock the player cannot see.
 */
export function stepArrivals(state: SimState, dt: number): void {
  // A step of no time passes nothing — the same invariant every other system in `step` holds,
  // stated here because marking has no cooldown of its own to fall back on for it.
  if (dt <= 0) return;

  const mounts = CASE_BY_ID[state.caseId].mounts;
  const remaining: Arrival[] = [];

  for (const arrival of state.arrivals) {
    const mount = mounts[arrival.mountIndex];
    let uses = arrival.uses;

    if (mount !== undefined) {
      for (const enemy of state.enemies) {
        if (uses <= 0) break;
        if (enemy.hp <= 0 || isTagged(enemy)) continue;
        if (PATHOGENS[enemy.kind].noTag === true) continue;
        if (distance(mount[0], mount[1], enemy.x, enemy.y) > DEFENDERS.anti.range) continue;

        enemy.tag = DEFENDERS.anti.tag;
        uses -= 1;
      }
    }

    if (uses > 0) remaining.push(uses === arrival.uses ? arrival : { ...arrival, uses });
  }

  state.arrivals = remaining;
}
