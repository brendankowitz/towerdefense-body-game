import { PATHOGENS } from '../content/pathogens';
import {
  BLEED_AMOUNT,
  BLEED_INTERVAL,
  DORMANT_CHANCE,
  DORMANT_DELAY,
  DORMANT_HP_FRACTION,
  INFLAMMATION_PER_PIP,
  POISON_DPS_ANTIBODY,
  POISON_DPS_OTHER,
  POISON_RADIUS,
  TOXIN_STUN_RADIUS,
} from '../content/rules';
import { positionAt } from '../path';
import { createRng } from '../rng';
import { distance } from '../state';
import type { Dormant, Enemy, SimState } from '../types';

/**
 * Wound cases bleed energy every second until a clot exists. Clamped here rather than in the
 * display, which is where the prototype clamped it while letting the value settle at −1
 * (decision D3).
 */
export function applyWoundBleed(state: SimState, dt: number): void {
  if (state.rule !== 'wound') return;
  if (state.towers.some((tower) => tower.kind === 'clot')) return;

  state.bleedTimer += dt;
  if (state.bleedTimer < BLEED_INTERVAL) return;

  state.bleedTimer = 0;
  state.energy = Math.max(0, state.energy - BLEED_AMOUNT);
}

/**
 * Clots are inert and the memory cell's stated perk is toxin immunity. Everything else stuns.
 * Note the exemption list here is deliberately *wider* than `applyPoison`'s — see decision D8.
 */
export function applyToxinStun(state: SimState, enemy: Enemy): void {
  const stun = PATHOGENS[enemy.kind].stun;
  if (stun === undefined) return;

  for (const tower of state.towers) {
    if (tower.kind === 'clot' || tower.kind === 'mem') continue;
    if (distance(tower.x, tower.y, enemy.x, enemy.y) < TOXIN_STUN_RADIUS) {
      tower.stun = Math.max(tower.stun, stun);
    }
  }
}

/**
 * Poison cases damage defenders directly. Antibodies resist far better; only the inert clot is
 * exempt.
 *
 * Decision D8, deliberate asymmetry: the memory cell escapes `applyToxinStun` but is damaged
 * here. Stun resistance is its stated perk — "toxins cannot stun it" — whereas the poison case
 * rule harms every living cell. Exempting it from poison too would make Learn strictly dominant
 * in the stomach case.
 *
 * Decision D25: this runs once per enemy in range, so a crowd poisons proportionally — the same
 * shape as D10's clot wear, in the same step loop, and kept for the same reason. Two case rules
 * pricing a crowd differently would be the real inconsistency.
 *
 * It is kept on measurement rather than on principle. Repricing it flat moves stomach's clear
 * rate from 5.5% to 6.5% — past throat's 6.3%, which inverts the season's difficulty curve and
 * fails the sweep's monotonic assertion. Capping the crowd buys nothing, because the crowd never
 * gets large: across the whole board space a cell is inside `POISON_RADIUS` on 3.7% of
 * cell-steps, the mean crowd when exposed is 1.16, and the largest ever observed is 4.
 *
 * Unlike D10 this earns no brief copy. Every clot in the stomach case dies to wear, so the crowd
 * is that cell's whole story; poison at a mean crowd of 1.16 is not, and the rule line already
 * says what matters — antibodies survive toxins far better than phagocytes.
 */
export function applyPoison(state: SimState, enemy: Enemy, dt: number): void {
  if (state.rule !== 'poison') return;

  for (const tower of state.towers) {
    if (tower.kind === 'clot') continue;
    if (distance(tower.x, tower.y, enemy.x, enemy.y) < POISON_RADIUS) {
      tower.hp -= (tower.kind === 'anti' ? POISON_DPS_ANTIBODY : POISON_DPS_OTHER) * dt;
    }
  }
}

/**
 * Allergy cases charge for the response rather than for the threat. Every body killed inflames the
 * tissue a little, and once the inflammation has built up enough it takes a pip — so the player
 * loses this case by defending it well.
 *
 * Called from `resolveDeaths` under the same guard as splitting and dormancy, which is what makes
 * the rule the inverse of every other one rather than an addition to them: a leak is marked dead
 * before the death pass (decision D11), so something that walked past everything costs no
 * inflammation at all. Kill it and you pay; let it through and you do not.
 *
 * The remainder is carried rather than cleared, so a hundred kills cost the same whether they
 * arrive in one wave or spread over five. Clearing it would make a wave boundary a place to dump
 * kills for free, and the player cannot see the counter to exploit it deliberately anyway — which
 * would make it a hidden rule rather than a hard one.
 */
export function applyInflammation(state: SimState): void {
  if (state.rule !== 'allergy') return;

  state.inflammation += 1;
  if (state.inflammation < INFLAMMATION_PER_PIP) return;

  state.inflammation -= INFLAMMATION_PER_PIP;
  state.tissue -= 1;
}

/**
 * Dormancy cases do not finish with everything they kill. A share of it goes down where it stood
 * and wakes once, weaker, from that same place — so a stretch of vessel the player fought clear is
 * not a stretch they hold.
 *
 * Only an original is ever scheduled. A split child is already a second life and a revenant is
 * already a second life, so keying on `generation === 0` is what bounds the whole thing at one
 * extra body per body — without it a case with a splitter in it compounds.
 *
 * Called from `resolveDeaths`, at the same point and under the same guard as splitting, so a leak
 * is never scheduled: something that reached the end is through, not killed (decision D11).
 *
 * The draw runs off the sim's own generator and writes the counter back, the way `buildQueue`
 * does, so a run is reproducible from its seed and the sweep measures a case rather than a shuffle.
 */
export function scheduleDormancy(state: SimState, enemy: Enemy): void {
  if (state.rule !== 'dormant') return;
  if (enemy.generation !== 0) return;

  const rng = createRng(state.rngState);
  const roll = rng.next();
  state.rngState = rng.state;
  if (roll >= DORMANT_CHANCE) return;

  state.dormant.push({
    kind: enemy.kind,
    distance: enemy.distance,
    hp: PATHOGENS[enemy.kind].hp * DORMANT_HP_FRACTION,
    delay: DORMANT_DELAY,
  });
}

/**
 * Wakes whatever is due. Runs beside spawning rather than after movement, so a revenant is on the
 * board for the whole of the step it appears on and is moved and shot at like anything else.
 *
 * A woken body carries the reduced health as its *maximum* as well as its current, because a share
 * of it is what came back — a killer cell that finishes anything under its threshold has to mean a
 * share of the body in front of it, not of the body that died five seconds ago.
 */
export function applyDormantWake(state: SimState, dt: number): void {
  if (state.dormant.length === 0) return;

  const stillDown: Dormant[] = [];
  for (const entry of state.dormant) {
    entry.delay -= dt;
    if (entry.delay > 0) {
      stillDown.push(entry);
      continue;
    }

    const [x, y] = positionAt(state.path, entry.distance);
    state.enemies.push({
      id: state.nextEnemyId,
      kind: entry.kind,
      distance: entry.distance,
      x,
      y,
      hp: entry.hp,
      maxHp: entry.hp,
      tag: 0,
      generation: 2,
    });
    state.nextEnemyId += 1;
  }
  state.dormant = stillDown;
}
