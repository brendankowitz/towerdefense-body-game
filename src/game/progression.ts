import { CASES, CASE_BY_ID } from './content/cases';
import { CASE_CLEAR_BANK, FRESH_PROFILE, IMMUNITY_MAX, SHORE_UP_COST } from './content/rules';
import { STRAIN_ROWS, VACCINES } from './content/vaccines';
import {
  caseAt, createFront, holdCore, holdRegion, hotCases, isLastStand, loseCore, shoreUp, nodeOf,
  wallStatus, type Front, type FrontRules,
} from './front';
import type { BodyNodeId, CaseId, StrainId, Tier } from './types';

/** Everything a run carries between cases. The simulation reads it; only this module writes it. */
export interface Profile {
  readonly cleared: readonly CaseId[];
  readonly immunity: Readonly<Record<StrainId, number>>;
  readonly bank: number;
  readonly kills: number;
  /**
   * The run's front line. It lives on the profile because it is what a run *is* now — the day, the
   * ground held and the ground lost — and a save that restored the cleared list without it would
   * put the player back on a map with no sickness on it. `front.day` is the only day a run has:
   * a second counter here would just be the same number kept in two places.
   */
  readonly front: Front;
}

/**
 * The one fresh profile. First run and "Start a new body" are the same state (decision D7) —
 * the prototype's day-4 opening was demo staging. A new object every call, so nothing that
 * spreads or stores a profile can reach back and change what the next new body starts from.
 */
export function createFreshProfile(): Profile {
  return {
    cleared: [],
    immunity: { staph: 0, film: 0, virus: 0 },
    bank: FRESH_PROFILE.bank,
    kills: 0,
    front: createFront(FRESH_PROFILE.seed),
  };
}

/**
 * Clearing a case banks the reward, raises the immunity of the strain the case declares it
 * credits (decision D6) — not a branch on the illness type, which left the Biofilm serum
 * permanently unearnable — and holds the region the case was fought over. `cleared` is an
 * ordered unique list (decision D4).
 *
 * Spending the day is deliberately not here: a clear and a loss both cost a day, and `endDay`
 * is the one place that charges it, so a caller always pairs this with that rather than getting
 * the day for free on a win.
 *
 * `cleared` is a record of what a run has *done*, not of what it still has. It never shrinks, so
 * it is not the count of ground the body holds and must never be shown as one — the sickness can
 * retake a region and this list will go on naming it. `front.held` is what the body has now, and
 * `heldRegionCount` is the one function every screen and the ending read it through. What
 * `cleared.length` is right for is the vaccine gates: a gate is a thing a run earned by clearing
 * cases, and losing ground afterward does not un-earn it.
 *
 * The last stand is the one case that is not a region: winning it takes the core back and drives
 * the sickness off the roads (`holdCore`), and it never enters `cleared` — the core is defended
 * rather than held, so a heart in that list would buy a gate step nothing earned. That the last
 * stand was won is recorded where it is true: `front.held`.
 */
export function clearCase(profile: Profile, caseId: CaseId, totalKills: number): Profile {
  const strain = CASE_BY_ID[caseId].credits;
  const lastStand = isLastStand(caseId);
  return {
    cleared: lastStand || profile.cleared.includes(caseId)
      ? profile.cleared
      : [...profile.cleared, caseId],
    immunity: {
      ...profile.immunity,
      [strain]: Math.min(IMMUNITY_MAX, profile.immunity[strain] + 1),
    },
    bank: profile.bank + CASE_CLEAR_BANK,
    kills: totalKills,
    front: lastStand ? holdCore(profile.front) : holdRegion(profile.front, nodeOf(caseId)),
  };
}

/**
 * The last stand lost. `endDay` still runs afterward the same as any other fight the player
 * leaves — a day passes and the sickness still takes its step — but nothing about that matters
 * once this has been called: `isRunLost` reads `front.lost` from here on, whatever else the day
 * goes on to do.
 */
export function recordCoreLoss(profile: Profile): Profile {
  return { ...profile, front: loseCore(profile.front) };
}

/** The case the body needs next, or null when nothing is left today. */
export function nextCaseId(profile: Profile): CaseId | null {
  return CASES.find((definition) => !profile.cleared.includes(definition.id))?.id ?? null;
}

/**
 * Reinforcing a wall: the bank pays `SHORE_UP_COST` and the front adds a day to the region's
 * siege. Spending the day itself is not this function's job — `ProfileProvider.shoreUp` chains
 * it into the same `endDay` a fight's result takes, so reinforcing costs exactly as much of the
 * day as fighting does.
 *
 * `shoreUp` itself already refuses ground the player does not hold; mirrored here so the bank
 * is never spent on a call that changed nothing, whatever calls this beyond the map's own
 * button, which only ever offers held ground in the first place.
 *
 * Affordability gets the identical treatment, and for a sharper reason: the only thing that used
 * to stop the bank going negative was a render-time condition deciding whether the buttons
 * appeared, and the map draws one button per held wall off a profile that is written
 * synchronously — so two taps landing before the re-render spent 240 from a bank of 120. A
 * negative bank does not misbehave either; `parseProfile` rejects it, and a rejected parse is a
 * fresh body, so the run would be deleted on the next launch with nothing said to the player.
 */
export function shoreUpRegion(profile: Profile, node: BodyNodeId): Profile {
  if (!profile.front.held.includes(node)) return profile;
  if (profile.bank < SHORE_UP_COST) return profile;
  return {
    ...profile,
    bank: profile.bank - SHORE_UP_COST,
    front: shoreUp(profile.front, node, profile.immunity),
  };
}

/** The one row in `VACCINES` each gated effect answers to, found by the name the season shows it under. */
function gateOf(name: string): number | undefined {
  return VACCINES.find((vaccine) => vaccine.name === name)?.gate;
}

/**
 * MMR's whole effect: past its gate, the amnesia wipe `createSimState` would otherwise apply does
 * not happen. Reading the gate straight off `VACCINES` is what keeps this and the AVAILABLE label
 * `vaccineRows` shows for the same row from ever disagreeing about when the block starts — there
 * is no second number here to fall out of step with the one the player sees.
 */
export function blocksAmnesia(profile: Profile): boolean {
  const gate = gateOf('Measles, mumps, rubella');
  return gate !== undefined && profile.cleared.length >= gate;
}

/**
 * The rules a day's sickness plays under, decided here because this is the layer that knows a
 * gate from a vaccine — `front.ts` only ever receives the fact `wallsCannotFall` it needs to act
 * on, never the vaccine, the gate or the profile that earned it.
 */
export function frontRules(profile: Profile): FrontRules {
  const gate = gateOf('Chickenpox');
  return { wallsCannotFall: gate !== undefined && profile.cleared.length >= gate };
}

export interface StrainRow {
  readonly key: StrainId;
  readonly name: string;
  readonly effect: string;
  readonly progress: string;
  readonly held: boolean;
}

export function strainRows(profile: Profile): readonly StrainRow[] {
  return STRAIN_ROWS.map(({ key, name, effect }) => {
    const count = profile.immunity[key];
    const held = count >= IMMUNITY_MAX;
    return {
      key,
      name,
      effect,
      held,
      progress: held ? 'DONE' : `${String(count)}/${String(IMMUNITY_MAX)}`,
    };
  });
}

export type VaccineStatus = 'held' | 'progress' | 'available' | 'locked' | 'later' | 'none';

export interface VaccineRow {
  readonly name: string;
  readonly effect: string;
  readonly label: string;
  readonly status: VaccineStatus;
}

export function vaccineRows(profile: Profile): readonly VaccineRow[] {
  return VACCINES.map((vaccine) => {
    let status: VaccineStatus = 'none';
    let label = 'NONE EXISTS';

    if (vaccine.later === true) {
      // Not locked: there is nothing to unlock. The row states what the season intends to add,
      // and a player reading it should not go looking for the case that opens it.
      status = 'later';
      label = 'LATER';
    } else if (vaccine.strain !== undefined) {
      const count = profile.immunity[vaccine.strain];
      status = count >= IMMUNITY_MAX ? 'held' : 'progress';
      label = status === 'held' ? 'HELD' : `${String(count)}/${String(IMMUNITY_MAX)}`;
    } else if (vaccine.gate !== undefined) {
      status = profile.cleared.length >= vaccine.gate ? 'available' : 'locked';
      label = status === 'available' ? 'AVAILABLE' : 'LOCKED';
    }

    return { name: vaccine.name, effect: vaccine.effect, label, status };
  });
}

/**
 * What a row records having happened. A forecast needed `next` for a case not yet reached and
 * `warn`/`unknown` for promises the season had not built yet — a front line has neither: which
 * ground catches fire next is not knowable ahead of the day it happens, and `LATER` is retired
 * for the same reason. What is left is only ever one of two facts about a region: the body took
 * it and still has it, or the sickness is standing on it right now.
 */
export type SeasonState = 'done' | 'now';

export interface SeasonRow {
  readonly name: string;
  readonly region: string;
  readonly note: string;
  readonly status: string;
  readonly tier: Tier;
  readonly state: SeasonState;
}

/** "FOREARM · CASE 04" is the fight-screen kicker; the timeline wants just "Forearm". */
function regionName(region: string): string {
  const head = region.split(' · ')[0] ?? region;
  const lower = head.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * The season timeline, read off the front line instead of the case order: ground the body took
 * and still holds, chronological in the order it was taken because that is the order `held`
 * itself grows in, followed by every region on fire today. A region can be both cleared once and
 * on fire now — the sickness took it back — and that is carried as a note on the burning row
 * rather than a third state, because to the player today it is exactly as fightable as ground
 * that has never been held.
 */
export function seasonRows(profile: Profile): readonly SeasonRow[] {
  const front = profile.front;

  const held: SeasonRow[] = front.held.flatMap((node): SeasonRow[] => {
    const caseId = caseAt(node);
    if (caseId === null) return [];
    const definition = CASE_BY_ID[caseId];
    const besieged = front.siege[node] !== undefined;
    return [{
      name: definition.title,
      region: regionName(definition.region),
      note: besieged ? 'Cleared — the wall is under siege' : 'Cleared — this region is holding',
      status: wallStatus(front, node),
      tier: definition.tier,
      state: 'done',
    }];
  });

  const burning: SeasonRow[] = hotCases(front).map((caseId) => {
    const definition = CASE_BY_ID[caseId];
    const retaken = profile.cleared.includes(caseId);
    return {
      name: definition.title,
      region: regionName(definition.region),
      note: retaken ? 'Lost — the sickness has retaken this ground' : '',
      status: 'UNDER ATTACK',
      tier: definition.tier,
      state: 'now',
    };
  });

  return [...held, ...burning];
}
