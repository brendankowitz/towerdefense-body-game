import { CASE_BY_ID } from './content/cases';
import { DEFENDERS } from './content/defenders';
import { PATHOGENS } from './content/pathogens';
import {
  ARRIVAL_USES, IMMUNITY_MAX, RECOGNITION_PER_CALL, RESPONSE_PER_CLEAR,
} from './content/rules';
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
 * Which kind of help a successful call buys, given how many times the body has already cleared
 * the strain it was banked on. This is the biology, not a balance dial: a first exposure produces
 * IgM, and IgG — the isotype ADCC actually runs on — is what repeat exposure produces, so nothing
 * short of a held vaccine (`IMMUNITY_MAX`) ever buys a killer. No ratio constant sits beside it;
 * Task 9 is what earns one, once a board exists that can measure what the mix should be.
 *
 * `roll` is read only once memory is maxed — the coin a call at full memory turns on between an
 * antibody, which keeps marking bodies the killer still depends on, and a killer, which finally
 * answers those marks. Below the max the mix isn't a coin at all, so the parameter is never read;
 * defaulting it to the losing side of that coin (`0.5`) means a bare `arrivalKindFor(memory)` call
 * exercises the same "nothing sent" path a caller with no roll on hand would actually take.
 */
export function arrivalKindFor(memory: number, roll = 0.5): Arrival['kind'] {
  if (memory < IMMUNITY_MAX) return 'antibody';
  return roll < 0.5 ? 'killer' : 'antibody';
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
 * The kind roll is drawn on every path, answered or not, so which arrivals a replay produces never
 * depends on whether an earlier one happened to succeed.
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
    const kind = arrivalKindFor(state.immunity[strain], rng.next());
    state.rngState = rng.state;

    if (mountIndex === undefined || !answered) continue;
    state.arrivals.push({ mountIndex, kind, uses: ARRIVAL_USES });
  }
}

/**
 * What an arrival actually does, run from `step` the same pass the cells act in — so an arrival
 * and a cell can never disagree about the order of a frame.
 *
 * An antibody marks with the same field and the same duration the placed cell uses,
 * `DEFENDERS.anti.tag`, so every downstream reader of `isTagged` — armour, the burn, the kill's
 * reward — treats an arrival's mark and a cell's mark as the one thing they are; this never
 * invents a second kind. A killer kills outright rather than rolling damage, the way `nk`'s own
 * execute does at its threshold — ADCC does not wound what it answers, it destroys it. Reach for
 * either is the cognate placed cell's own range: an arrival is that cell, not a rule invented
 * beside one.
 *
 * **A killer can only kill what `isTagged` already says is marked.** That is ADCC, and it is also
 * the guardrail the free-arrival design rests on: a killer that could reach an unmarked body would
 * bypass the build-spot scarcity the whole game is priced on, so it is worth exactly what the
 * player's own tagging — from a placed `anti` cell or from an antibody arrival — made it worth. It
 * never marks anything itself, and there is no fallback path that lets it act on nothing.
 *
 * Ammunition, not a timer, for both kinds. Against a particulate target an antibody is
 * internalised bound to what it caught and degraded with it, and a killer cell is spent doing the
 * one thing ADCC does — so each spends one use per body it acts on and the arrival leaves the
 * instant it has none left. Nothing here runs down on a clock the player cannot see.
 */
export function stepArrivals(state: SimState, dt: number): void {
  // A step of no time passes nothing — the same invariant every other system in `step` holds,
  // stated here because neither kind has a cooldown of its own to fall back on for it.
  if (dt <= 0) return;

  const mounts = CASE_BY_ID[state.caseId].mounts;
  const remaining: Arrival[] = [];

  for (const arrival of state.arrivals) {
    const mount = mounts[arrival.mountIndex];
    let uses = arrival.uses;

    if (mount !== undefined) {
      const range = arrival.kind === 'antibody' ? DEFENDERS.anti.range : DEFENDERS.nk.range;

      for (const enemy of state.enemies) {
        if (uses <= 0) break;
        if (enemy.hp <= 0) continue;
        if (distance(mount[0], mount[1], enemy.x, enemy.y) > range) continue;

        if (arrival.kind === 'antibody') {
          if (isTagged(enemy)) continue;
          if (PATHOGENS[enemy.kind].noTag === true) continue;
          enemy.tag = DEFENDERS.anti.tag;
        } else {
          // The guardrail: nothing but a mark already on the body earns it a hit here.
          if (!isTagged(enemy)) continue;
          enemy.hp = 0;
        }

        uses -= 1;
      }
    }

    if (uses > 0) remaining.push(uses === arrival.uses ? arrival : { ...arrival, uses });
  }

  state.arrivals = remaining;
}
