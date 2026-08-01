import { describe, expect, it } from 'vitest';
import {
  blocksAmnesia, clearCase, createFreshProfile, frontRules, nextCaseId, recordCoreLoss, seasonRows,
  shoreUpRegion, strainRows, vaccineRows, type Profile,
} from './progression';
import { CASE_REGIONS } from './content/body';
import { CASES } from './content/cases';
import { CASE_CLEAR_BANK, FRESH_PROFILE, IMMUNITY_MAX, SHORE_UP_COST } from './content/rules';
import { STRAIN_ROWS, VACCINES } from './content/vaccines';
import { createFront, hotCases, isRunLost, nodeOf, wallDays, wallStatus, type Front } from './front';
import { CORE_ROADS } from './graph';
import type { CaseId, StrainId } from './types';

/**
 * Every expectation here is derived from `content/`, so a balance pass moves days, banks,
 * immunity ceilings, case order and vaccine copy without turning this suite red.
 */

const STRAINS: readonly StrainId[] = STRAIN_ROWS.map((row) => row.key);

function requireCase(index: number) {
  const definition = CASES[index];
  if (definition === undefined) throw new Error(`content has no case at index ${String(index)}`);
  return definition;
}

/** The case whose clears earn `strain`'s vaccine. Content guarantees one exists (criterion 6). */
function caseCrediting(strain: StrainId) {
  const definition = CASES.find((entry) => entry.credits === strain);
  if (definition === undefined) {
    throw new Error(`no case credits ${strain}, so its vaccine is unreachable`);
  }
  return definition;
}

function profileWith(overrides: Partial<Profile>): Profile {
  return { ...createFreshProfile(), ...overrides };
}

function clearedIds(count: number): readonly CaseId[] {
  return CASES.slice(0, count).map((definition) => definition.id);
}

describe('createFreshProfile', () => {
  it('starts a body with nothing cleared, no immunity, and the fresh bank', () => {
    expect(createFreshProfile()).toEqual({
      cleared: [],
      immunity: { staph: 0, film: 0, virus: 0 },
      bank: FRESH_PROFILE.bank,
      kills: 0,
      front: createFront(FRESH_PROFILE.seed),
    });
  });

  /**
   * Decision D7: one factory serves both the first run and "Start a new body". A shared
   * instance would let a run that has already been played leak into the next new body.
   */
  it('hands out an independent profile every time, so a new body starts from nothing', () => {
    const first = createFreshProfile();
    const played = clearCase(first, requireCase(0).id, 12);

    expect(played).not.toEqual(first);
    expect(createFreshProfile()).toEqual(first);
    expect(createFreshProfile()).not.toBe(createFreshProfile());
    expect(createFreshProfile().immunity).not.toBe(createFreshProfile().immunity);
  });

  it('carries a front line from the first day of a new body', () => {
    const profile = createFreshProfile();
    expect(profile.front.day).toBe(1);
    expect(profile.front.infected).toHaveLength(1);
  });
});

describe('nextCaseId', () => {
  it('offers the first uncleared case', () => {
    expect(nextCaseId(createFreshProfile())).toBe(requireCase(0).id);
  });

  it('moves on as cases are cleared, in content order', () => {
    let profile = createFreshProfile();
    for (const definition of CASES) {
      expect(nextCaseId(profile)).toBe(definition.id);
      profile = clearCase(profile, definition.id, 0);
    }
  });

  it('returns null when nothing needs you today', () => {
    const profile = profileWith({ cleared: clearedIds(CASES.length) });
    expect(nextCaseId(profile)).toBeNull();
  });
});

describe('clearCase', () => {
  it('banks the reward without spending the day — that is endDay\'s job', () => {
    const fresh = createFreshProfile();
    const profile = clearCase(fresh, requireCase(0).id, 0);

    expect(profile.front.day).toBe(fresh.front.day);
    expect(profile.bank).toBe(fresh.bank + CASE_CLEAR_BANK);
  });

  it('raises the strain immunity toward the maximum', () => {
    const definition = requireCase(0);
    const profile = clearCase(createFreshProfile(), definition.id, 0);
    expect(profile.immunity[definition.credits]).toBe(1);
  });

  it('never raises immunity past the maximum', () => {
    const definition = requireCase(0);
    const maxed = profileWith({
      immunity: { ...createFreshProfile().immunity, [definition.credits]: IMMUNITY_MAX },
    });

    const profile = clearCase(maxed, definition.id, 0);
    expect(profile.immunity[definition.credits]).toBe(IMMUNITY_MAX);
  });

  /** Decision D6: the strain credited is the one the case declares, never a branch on its rule. */
  it('credits exactly the strain each case declares — decision D6', () => {
    for (const definition of CASES) {
      const profile = clearCase(createFreshProfile(), definition.id, 0);
      for (const strain of STRAINS) {
        expect(profile.immunity[strain]).toBe(strain === definition.credits ? 1 : 0);
      }
    }
  });

  it('makes the Biofilm serum earnable — the broken promise is fixed', () => {
    const profile = clearCase(createFreshProfile(), caseCrediting('film').id, 0);
    expect(profile.immunity.film).toBe(1);
  });

  /** Decision D4: `cleared` is an ordered unique list, not a growing concat. */
  it('records the case once, even if cleared again', () => {
    const definition = requireCase(0);
    let profile = clearCase(createFreshProfile(), definition.id, 0);
    profile = clearCase(profile, definition.id, 0);

    expect(profile.cleared).toEqual([definition.id]);
  });

  it('keeps cleared cases in the order they were cleared', () => {
    const [first, second] = [requireCase(1), requireCase(0)];
    let profile = clearCase(createFreshProfile(), first.id, 0);
    profile = clearCase(profile, second.id, 0);

    expect(profile.cleared).toEqual([first.id, second.id]);
  });

  it('carries the run kill count into the profile', () => {
    const profile = clearCase(createFreshProfile(), requireCase(0).id, 47);
    expect(profile.kills).toBe(47);
  });

  it('leaves the profile it was given untouched', () => {
    const fresh = createFreshProfile();
    clearCase(fresh, requireCase(0).id, 9);

    expect(fresh).toEqual(createFreshProfile());
  });

  /**
   * `cleared.length` is what the map divides by `CASE_REGIONS.length`, what the vaccine gates
   * count and what the dock's unlock schedule reads. The core is defended, never held, so a won
   * last stand must not enter that list — counted there it reads as an eleventh region out of ten
   * and buys a gate step nothing earned. Where the win *is* recorded is the front.
   */
  it('does not count a won last stand as a region held', () => {
    const fresh = createFreshProfile();
    const reached: Profile = {
      ...fresh,
      front: { ...fresh.front, infected: [...CORE_ROADS, 'heart'] },
    };

    const after = clearCase(reached, 'heart', 3);
    expect(after.cleared).not.toContain('heart');
    expect(after.cleared.length).toBeLessThanOrEqual(CASE_REGIONS.length);
    expect(after.front.held, 'nothing recorded that the last stand was won').toContain('heart');
    expect(after.bank, 'the fight paid nothing').toBe(reached.bank + CASE_CLEAR_BANK);
  });

  /** The rally, through the door the app actually calls — see `holdCore` for why it is the rule. */
  it('drives the sickness off the roads to the core when the last stand is won', () => {
    const fresh = createFreshProfile();
    const reached: Profile = {
      ...fresh,
      front: { ...fresh.front, infected: [...CORE_ROADS, 'heart'] },
    };

    const after = clearCase(reached, 'heart', 3);
    for (const road of CORE_ROADS) expect(after.front.infected).not.toContain(road);
  });

  it('holds the region a cleared case was fought over', () => {
    const profile = createFreshProfile();
    const [firstHot] = hotCases(profile.front);
    expect(firstHot).toBeDefined();
    if (firstHot === undefined) return;

    const after = clearCase(profile, firstHot, 12);
    expect(after.front.held).toContain(nodeOf(firstHot));
    expect(after.front.infected).not.toContain(nodeOf(firstHot));
  });
});

describe('recordCoreLoss', () => {
  it('marks the run lost without touching what the front already recorded', () => {
    const fresh = createFreshProfile();
    const profile: Profile = { ...fresh, front: { ...fresh.front, infected: ['heart'] } };

    const after = recordCoreLoss(profile);
    expect(isRunLost(after.front)).toBe(true);
    expect(after.front.infected).toEqual(profile.front.infected);
    expect(after.front.held).toEqual(profile.front.held);
  });

  it('leaves the profile it was given untouched', () => {
    const profile = createFreshProfile();
    recordCoreLoss(profile);
    expect(profile).toEqual(createFreshProfile());
  });
});

describe('shoreUpRegion', () => {
  function profileWithHeldRegion(): { readonly profile: Profile; readonly node: ReturnType<typeof nodeOf> } {
    const fresh = createFreshProfile();
    const [firstHot] = hotCases(fresh.front);
    if (firstHot === undefined) throw new Error('fixture expects an open front');
    return { profile: clearCase(fresh, firstHot, 0), node: nodeOf(firstHot) };
  }

  it('spends the bank', () => {
    const { profile, node } = profileWithHeldRegion();
    const after = shoreUpRegion(profile, node);
    expect(after.bank).toBe(profile.bank - SHORE_UP_COST);
  });

  it('adds a day to the region\'s wall', () => {
    const { profile, node } = profileWithHeldRegion();
    const after = shoreUpRegion(profile, node);
    expect(after.front.siege[node]).toBe(wallDays(node, profile.immunity) + 1);
  });

  /**
   * `{ ...profile }` alone would not catch an in-place mutation of `profile.front` — the copy
   * is shallow, so `before.front` and `profile.front` would still be the same object and an
   * `shoreUpRegion` that mutated the siege map in place would pass this unnoticed. A structured
   * clone captures the front's contents by value, which is the only way this test can tell "a
   * new front was returned" apart from "the old one was quietly edited".
   */
  it('leaves the profile it was given untouched', () => {
    const { profile, node } = profileWithHeldRegion();
    const before = structuredClone(profile);
    shoreUpRegion(profile, node);
    expect(profile).toEqual(before);
  });

  /** Ground the player does not hold cannot be shored up, and the bank is not spent trying. */
  it('changes nothing for ground that is not held', () => {
    const fresh = createFreshProfile();
    const after = shoreUpRegion(fresh, 'gut');
    expect(after).toEqual(fresh);
  });
});

describe('strainRows', () => {
  it('shows progress toward each vaccine and marks a completed one', () => {
    const immunity = { staph: IMMUNITY_MAX, virus: IMMUNITY_MAX - 1, film: 0 };
    const rows = strainRows(profileWith({ immunity }));

    const expected: Readonly<Record<StrainId, { progress: string; held: boolean }>> = {
      staph: { progress: 'DONE', held: true },
      virus: { progress: `${String(IMMUNITY_MAX - 1)}/${String(IMMUNITY_MAX)}`, held: false },
      film: { progress: `0/${String(IMMUNITY_MAX)}`, held: false },
    };

    expect(rows).toHaveLength(STRAIN_ROWS.length);
    for (const row of rows) {
      expect({ progress: row.progress, held: row.held }).toEqual(expected[row.key]);
    }
  });

  it('carries the content copy through in display order', () => {
    const rows = strainRows(createFreshProfile());
    expect(rows.map((row) => row.key)).toEqual(STRAIN_ROWS.map((row) => row.key));
    expect(rows.map((row) => row.name)).toEqual(STRAIN_ROWS.map((row) => row.name));
    expect(rows.map((row) => row.effect)).toEqual(STRAIN_ROWS.map((row) => row.effect));
  });
});

describe('vaccineRows', () => {
  it('lists every vaccine the immunity screen shows', () => {
    const rows = vaccineRows(createFreshProfile());
    expect(rows.map((row) => row.name)).toEqual(VACCINES.map((vaccine) => vaccine.name));
  });

  /** Three clears of the crediting case earn that strain's vaccine — the run-level rule. */
  it('counts a strain vaccine up by clears and marks it held at the third', () => {
    VACCINES.forEach((vaccine, index) => {
      const strain = vaccine.strain;
      if (strain === undefined) return;

      const source = caseCrediting(strain);
      let profile = createFreshProfile();
      expect(vaccineRows(profile)[index]?.label).toBe(`0/${String(IMMUNITY_MAX)}`);

      for (let clears = 1; clears <= IMMUNITY_MAX; clears += 1) {
        profile = clearCase(profile, source.id, 0);
        const row = vaccineRows(profile)[index];
        expect(row?.status).toBe(clears >= IMMUNITY_MAX ? 'held' : 'progress');
        expect(row?.label).toBe(
          clears >= IMMUNITY_MAX ? 'HELD' : `${String(clears)}/${String(IMMUNITY_MAX)}`,
        );
      }
    });
  });

  it('offers a gated vaccine only once enough cases are cleared', () => {
    VACCINES.forEach((vaccine, index) => {
      const gate = vaccine.gate;
      if (gate === undefined) return;

      for (let count = 0; count <= CASES.length; count += 1) {
        const row = vaccineRows(profileWith({ cleared: clearedIds(count) }))[index];
        const open = count >= gate;
        expect(row?.status).toBe(open ? 'available' : 'locked');
        expect(row?.label).toBe(open ? 'AVAILABLE' : 'LOCKED');
      }
    });
  });

  it('says so plainly when no vaccine exists', () => {
    VACCINES.forEach((vaccine, index) => {
      if (vaccine.strain !== undefined || vaccine.gate !== undefined || vaccine.later === true) return;

      const row = vaccineRows(profileWith({ cleared: clearedIds(CASES.length) }))[index];
      expect(row?.status).toBe('none');
      expect(row?.label).toBe('NONE EXISTS');
    });
  });
});

/**
 * MMR earned, stated as a fact rather than a purchase: nothing here is bought, so the only
 * question a vaccine can answer is whether its gate has been reached yet.
 */
describe('blocksAmnesia', () => {
  const mmrGate = VACCINES.find((vaccine) => vaccine.name === 'Measles, mumps, rubella')?.gate;

  it('is not yet true short of MMR\'s gate', () => {
    if (mmrGate === undefined) throw new Error('MMR carries no gate to test against');
    const profile = profileWith({ cleared: clearedIds(mmrGate - 1) });
    expect(blocksAmnesia(profile)).toBe(false);
  });

  it('applies the amnesia block once its gate is reached, without being bought', () => {
    const profile = { ...createFreshProfile(), cleared: CASES.slice(0, 2).map((c) => c.id) };
    expect(blocksAmnesia(profile)).toBe(true);
  });
});

/**
 * Chickenpox, the same shape one layer down: `frontRules` is what `front.ts` is handed instead of
 * a profile, so this is the one place that proves the fact it computes actually tracks the gate
 * the season screen shows.
 */
describe('frontRules', () => {
  const chickenpoxGate = VACCINES.find((vaccine) => vaccine.name === 'Chickenpox')?.gate;

  it('leaves walls fallible short of the gate', () => {
    if (chickenpoxGate === undefined) throw new Error('Chickenpox carries no gate to test against');
    const profile = profileWith({ cleared: clearedIds(chickenpoxGate - 1) });
    expect(frontRules(profile)).toEqual({ wallsCannotFall: false });
  });

  it('stops walls falling once Chickenpox is earned', () => {
    if (chickenpoxGate === undefined) throw new Error('Chickenpox carries no gate to test against');
    const profile = profileWith({ cleared: clearedIds(chickenpoxGate) });
    expect(frontRules(profile)).toEqual({ wallsCannotFall: true });
  });
});

describe('seasonRows', () => {
  /** A front built by hand, the way `front.test.ts` builds one, so a row's shape never depends on where the RNG happened to open the season's door. */
  function frontWith(overrides: Partial<Front>): Front {
    return { infected: [], held: [], siege: {}, day: 1, rngState: 1, lost: false, ...overrides };
  }

  function profileWithFront(overrides: Partial<Front>, cleared: readonly CaseId[] = []): Profile {
    return { ...createFreshProfile(), cleared, front: frontWith(overrides) };
  }

  /**
   * Two regions taken and standing, one region on fire — the shape the brief's own test is
   * written against. `state` no longer has anywhere to put a forecasted case, because a front
   * line does not know which ground catches fire next.
   */
  function profileOnDay(day: number): Profile {
    const [firstHeld, secondHeld, hot] = [requireCase(0), requireCase(1), requireCase(2)];
    return profileWithFront(
      { infected: [nodeOf(hot.id)], held: [nodeOf(firstHeld.id), nodeOf(secondHeld.id)], day },
      [firstHeld.id, secondHeld.id],
    );
  }

  it('shows the run that happened rather than a schedule that cannot be known', () => {
    const rows = seasonRows(profileOnDay(6));
    expect(rows.map((r) => r.state)).not.toContain('next');
    expect(rows.filter((r) => r.state === 'done')).toHaveLength(2);
  });

  it('lists held ground before ground on fire, and nothing untouched', () => {
    const rows = seasonRows(profileOnDay(6));
    const [firstHeld, secondHeld, hot] = [requireCase(0), requireCase(1), requireCase(2)];

    expect(rows.map((row) => row.name)).toEqual([firstHeld.title, secondHeld.title, hot.title]);
    expect(rows.map((row) => row.state)).toEqual(['done', 'done', 'now']);
  });

  it('lists held ground in the order it was taken, because that is the order `held` grows in', () => {
    const [first, second] = [requireCase(0), requireCase(1)];
    const profile = profileWithFront({ held: [nodeOf(second.id), nodeOf(first.id)] }, [second.id, first.id]);
    const rows = seasonRows(profile);
    expect(rows.map((row) => row.name)).toEqual([second.title, first.title]);
  });

  it('says a held region is holding, or under siege with the days it has left', () => {
    const [held, sieged] = [requireCase(0), requireCase(1)];
    const profile = profileWithFront(
      { held: [nodeOf(held.id), nodeOf(sieged.id)], siege: { [nodeOf(sieged.id)]: 2 } },
      [held.id, sieged.id],
    );
    const rows = seasonRows(profile);

    expect(rows[0]?.note).toBe('Cleared — this region is holding');
    expect(rows[0]?.status).toBe('Holding');
    expect(rows[1]?.note).toBe('Cleared — the wall is under siege');
    expect(rows[1]?.status).toBe('2 days left');
  });

  /**
   * `wallStatus` is the one place that spells out a wall's countdown — the map's own wall list
   * reads it the same way (`MapPage.tsx`) — so a held row's status is asserted here as a call
   * through to it rather than as a second literal string that could quietly drift from it.
   */
  it('reads a held row\'s status off the same wallStatus the map reads', () => {
    const [held, sieged] = [requireCase(0), requireCase(1)];
    const profile = profileWithFront(
      { held: [nodeOf(held.id), nodeOf(sieged.id)], siege: { [nodeOf(sieged.id)]: 3 } },
      [held.id, sieged.id],
    );
    const rows = seasonRows(profile);

    expect(rows[0]?.status).toBe(wallStatus(profile.front, nodeOf(held.id)));
    expect(rows[1]?.status).toBe(wallStatus(profile.front, nodeOf(sieged.id)));
  });

  it('says nothing extra about ground on fire for the first time', () => {
    const hot = requireCase(0);
    const rows = seasonRows(profileWithFront({ infected: [nodeOf(hot.id)] }));
    expect(rows[0]?.state).toBe('now');
    expect(rows[0]?.status).toBe('UNDER ATTACK');
    expect(rows[0]?.note).toBe('');
  });

  /** Ground the player took and then lost is still fightable today — it just says so. */
  it('marks ground on fire again as lost, not as new', () => {
    const retaken = requireCase(0);
    const rows = seasonRows(profileWithFront({ infected: [nodeOf(retaken.id)] }, [retaken.id]));
    expect(rows[0]?.state).toBe('now');
    expect(rows[0]?.note).toBe('Lost — the sickness has retaken this ground');
  });

  it('reports the tier each case declares rather than assuming they are all alike', () => {
    expect(
      new Set(CASES.map((definition) => definition.tier)).size,
      'every case is the same tier, so this test cannot tell a lookup from a constant',
    ).toBeGreaterThan(1);

    const profile = profileOnDay(1);
    const rows = seasonRows(profile);
    const [firstHeld, secondHeld, hot] = [requireCase(0), requireCase(1), requireCase(2)];

    expect(rows.map((row) => row.tier)).toEqual([firstHeld.tier, secondHeld.tier, hot.tier]);
  });

  it('names each region without the fight screen kicker', () => {
    const hot = requireCase(0);
    const rows = seasonRows(profileWithFront({ infected: [nodeOf(hot.id)] }));
    const region = rows[0]?.region ?? '';

    expect(region).not.toBe('');
    expect(region).not.toContain('·');
    expect(hot.region.toUpperCase()).toContain(region.toUpperCase());
    expect(region).toBe(region.charAt(0).toUpperCase() + region.slice(1).toLowerCase());
  });

  it('carries an empty front through as an empty record — nothing has happened yet to show', () => {
    expect(seasonRows(profileWithFront({}))).toEqual([]);
  });
});
