import { CASE_BY_ID } from './content/cases';
import { DEFENDERS, DEFENDER_ORDER } from './content/defenders';
import { PATHOGENS } from './content/pathogens';
import {
  ARRIVAL_USES, IMMUNITY_MAX, KILLER_DAMAGE, KILLER_MIX_CHANCE, RECOGNITION_PER_CALL,
  RESPONSE_PER_CLEAR,
} from './content/rules';
import { createRng, mixSeed } from './rng';
import { distance } from './state';
import { armourMultiplier, isTagged } from './systems/targeting';
import type { Arrival, Enemy, PathogenKind, SimState, StrainId } from './types';

/**
 * The strain this pathogen belongs to, if the immunity screen tracks it at all. `PathogenKind` and
 * `StrainId` overlap on exactly three members, and an immunity record's own keys are that overlap —
 * so this reads them rather than repeating the three names in a table of its own. A pollen or a
 * toxin is not a key an immunity record has, and is not a strain for the same reason it was never a
 * vaccine: nobody was ever asked to beat it three times.
 *
 * Takes the record rather than the whole `SimState`, the way `hasRule` (state.ts) takes the
 * narrowest shape it can: the brief screen asks this same question of a profile that has no
 * simulation behind it yet, and a second three-name table on that side is exactly the drift this
 * function exists to prevent.
 */
export function strainOf(
  immunity: Readonly<Record<StrainId, number>>,
  kind: PathogenKind,
): StrainId | undefined {
  return kind in immunity ? (kind as StrainId) : undefined;
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
  const strain = strainOf(state.immunity, enemy.kind);
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
 * the strain it was banked on. The gate is the biology, not a balance dial: a first exposure
 * produces IgM, and IgG — the isotype ADCC actually runs on — is what repeat exposure produces, so
 * nothing short of a held vaccine (`IMMUNITY_MAX`) ever buys a killer.
 *
 * Which of the two a call at full memory buys *is* a balance dial, though, so it lives in
 * `KILLER_MIX_CHANCE` where Task 9 can move it, rather than as a literal here — an antibody keeps
 * marking bodies the killer still depends on, and a killer finally answers a mark already laid.
 *
 * `roll` is read only once memory is maxed; below the max the mix isn't a roll at all, so the
 * parameter is never read there. Defaulting it to `1` — outside the `[0, 1)` a real roll ever
 * lands in — means a bare `arrivalKindFor(memory)` call always takes the antibody path even at
 * full memory, the same "nothing decided yet" reading a caller with no roll on hand should get.
 */
export function arrivalKindFor(memory: number, roll = 1): Arrival['kind'] {
  if (memory < IMMUNITY_MAX) return 'antibody';
  return roll < KILLER_MIX_CHANCE ? 'killer' : 'antibody';
}

/**
 * The seed the three rolls of one call are drawn from: where the wave's shared stream has reached,
 * folded together with what this particular board has made of the fight so far.
 *
 * **Without the second half these are not probabilities at all.** `buildQueue` reseeds
 * `state.rngState` from `waveSeed(caseId, waveIndex)` at the start of every wave, and inside a wave
 * the only other writer is `scheduleDormancy`, which two of the eleven cases have. So on the other
 * nine, every board of a case arrives at the *k*-th call of wave *w* holding the identical stream
 * position, and drawing straight off it hands all 7776 of them the same three numbers. Measured
 * before this existed: sinus answered 24 calls across 120 boards, 23 of them rolling 0.944, and not
 * one killer ever arrived on that case or on vesper at any setting of `KILLER_MIX_CHANCE` under
 * 0.944 — a dial the case could not obey and a promise `Brief.tsx` could not keep. The design is the
 * player's own sentence, *my resistance is x, so I have y chance of attracting help*, and a chance
 * that resolves the same way on every board of a case is not one.
 *
 * **What is folded in is the board's own progress, and every field is an integer.** `mixSeed`
 * truncates, so a fractional field would be a coarser fact than it looks; `state.energy` is the one
 * that tempts and it is fractional (`TAG_REWARD_MULTIPLIER` is 1.5), so it is left out rather than
 * folded in at whatever precision `| 0` happens to give. What is here is what the player did: how
 * much has died, how much got through, how many bodies the vessel has seen, how much tissue is left,
 * and which cells are standing where. Two boards that have genuinely played the same game to this
 * point — the same cells bought, the same fight — fold to the same seed and roll the same, which is
 * what determinism means and not a residue of the defect above.
 *
 * **The stream is still what separates one call from the next.** `state.rngState` leads the fold, so
 * two calls at the same board state — the second strain of the same step, or a call five steps later
 * on a board where nothing changed — cannot collide: `callArrivals` writes the advanced stream back
 * before the next strain reads it.
 *
 * **The mixing does not outlive the wave.** `callArrivals` writes the mixed stream back, so a board
 * that called for help carries a board-dependent `state.rngState` for the rest of that wave — which
 * reaches `scheduleDormancy` on the two cases that have it. That is not new: a call already spent
 * three draws off the shared stream whether or not it was answered, and *whether* a call happened is
 * itself board-dependent, so those two cases' dormancy rolls already moved with the board. What
 * changes is the value, not the fact. `buildQueue` reseeds at every wave boundary, so nothing here
 * reaches the next wave's spawn order at all.
 *
 * **The same shape exists elsewhere and is deliberately left alone.** Every other in-fight roll in
 * this game draws off a stream seeded only by the case and the wave — `scheduleDormancy` most of
 * all, where the chance a body comes back is a fixed script per (case, wave, death index) on a board
 * that has not called for help. Widening the fix to the stream itself is a bigger change than the
 * task that found it, so it is written down here rather than made.
 *
 * Exported for the same reason `boardAt` (`tests/sweep/playBoard.ts`) is: the property this exists
 * for — a spread of boards standing at the identical stream position must not be handed the
 * identical roll — is a statement about this function, and reading it back out of three arrival
 * kinds is a weaker test of a sharper claim.
 */
export function callSeed(state: SimState): number {
  let seed = mixSeed(state.rngState, state.totalKills);
  seed = mixSeed(seed, state.waveLeaks);
  seed = mixSeed(seed, state.nextEnemyId);
  seed = mixSeed(seed, state.tissue);
  for (const tower of state.towers) {
    seed = mixSeed(seed, tower.spotIndex);
    seed = mixSeed(
      seed,
      DEFENDER_ORDER.indexOf(tower.kind) + (tower.matured ? DEFENDER_ORDER.length : 0),
    );
  }
  return seed;
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
 *
 * All three come off `callSeed` rather than off `state.rngState` directly, which is what makes them
 * rolls rather than a fixed script per (case, wave, call index). That docstring is the argument.
 */
export function callArrivals(state: SimState): void {
  for (const strain of STRAINS) {
    const banked = state.recognition[strain] ?? 0;
    if (banked < RECOGNITION_PER_CALL) continue;

    const free = openMounts(state);
    if (free.length === 0) continue;

    state.recognition[strain] = banked - RECOGNITION_PER_CALL;

    const rng = createRng(callSeed(state));
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
 * invents a second kind. A killer hits for `KILLER_DAMAGE`, the same way `nk`'s own `execute` hits
 * for `dmg` — one shot, not a burn — because a killer cell is the shape ADCC actually mirrors in
 * this game's roster, so an arrival of that kind is that cell rather than a rule invented beside
 * one. It is not a guaranteed one-hit kill: a body a killer arrival cannot finish stays marked and
 * wounded for whatever finishes it next, the placed `nk` cell included.
 *
 * **A killer can only touch what `isTagged` already says is marked.** That is ADCC — a killer cell
 * does not choose its own targets, it destroys what antibody has flagged — and it is also the
 * guardrail the free-arrival design rests on: a killer that could reach an unmarked body would
 * bypass the build-spot scarcity the whole game is priced on, so it is worth exactly what the
 * player's own tagging — from a placed `anti` cell or from an antibody arrival — made it worth. It
 * never marks anything itself, and there is no fallback path that lets it act on nothing.
 *
 * Ammunition, not a timer, for both kinds. Against a particulate target an antibody is
 * internalised bound to what it caught and degraded with it, and a killer cell is spent on the one
 * hit it lands — so each spends one use per body it acts on, whether or not that hit finished the
 * body, and the arrival leaves the instant it has none left. Nothing here runs down on a clock the
 * player cannot see.
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
          // armourMultiplier is always 1 on the branch above — a killer arrival can only ever
          // reach a body isTagged already says is marked, and armour drops for exactly that
          // case — but this still calls it rather than assuming so, the same way every other
          // damage source in the game reaches hp through it and not around it.
          enemy.hp -= KILLER_DAMAGE * armourMultiplier(state, enemy);
        }

        uses -= 1;
      }
    }

    if (uses > 0) remaining.push(uses === arrival.uses ? arrival : { ...arrival, uses });
  }

  state.arrivals = remaining;
}
