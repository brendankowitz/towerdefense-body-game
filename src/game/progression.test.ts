import { describe, expect, it } from 'vitest';
import {
  clearCase, createFreshProfile, nextCaseId, seasonRows, strainRows, vaccineRows,
  type Profile,
} from './progression';
import { CASES } from './content/cases';
import { LATER } from './content/later';
import { CASE_CLEAR_BANK, FRESH_PROFILE, IMMUNITY_MAX } from './content/rules';
import { STRAIN_ROWS, VACCINES } from './content/vaccines';
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
  it('starts a body with nothing cleared, no immunity, and the fresh day and bank', () => {
    expect(createFreshProfile()).toEqual({
      cleared: [],
      immunity: { staph: 0, film: 0, virus: 0 },
      day: FRESH_PROFILE.day,
      bank: FRESH_PROFILE.bank,
      kills: 0,
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
  it('advances the day and banks the reward', () => {
    const fresh = createFreshProfile();
    const profile = clearCase(fresh, requireCase(0).id, 0);

    expect(profile.day).toBe(fresh.day + 1);
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
        expect(row?.cost).toBe(vaccine.cost ?? '');
      }
    });
  });

  it('says so plainly when no vaccine exists, and quotes no cost for it', () => {
    VACCINES.forEach((vaccine, index) => {
      if (vaccine.strain !== undefined || vaccine.gate !== undefined || vaccine.later === true) return;

      const row = vaccineRows(profileWith({ cleared: clearedIds(CASES.length) }))[index];
      expect(row?.status).toBe('none');
      expect(row?.label).toBe('NONE EXISTS');
      expect(row?.cost).toBe('');
    });
  });

  /**
   * The Chickenpox row shipped as `gate: 99` against a maximum of three clears, so it read LOCKED
   * whatever the player did — the same broken promise as the Biofilm serum that could never be
   * earned. A deferred row must never move, however much of the season is finished.
   */
  it('never lets a deferred vaccine look like something the player is failing to unlock', () => {
    const deferred = VACCINES.map((vaccine, index) => ({ vaccine, index }))
      .filter(({ vaccine }) => vaccine.later === true);
    expect(deferred.length, 'no vaccine is deferred, so this asserts nothing').toBeGreaterThan(0);

    for (let count = 0; count <= CASES.length; count += 1) {
      const rows = vaccineRows(profileWith({ cleared: clearedIds(count) }));
      for (const { vaccine, index } of deferred) {
        expect(rows[index]?.status, `${vaccine.name} at ${String(count)} clears`).toBe('later');
        expect(rows[index]?.label).toBe('LATER');
        expect(rows[index]?.label).not.toBe('LOCKED');
      }
    }
  });

  it('carries the stated cost through and leaves it empty where content states none', () => {
    // Both shapes have to be present or this asserts nothing about the empty case.
    expect(VACCINES.some((vaccine) => vaccine.cost !== undefined)).toBe(true);
    expect(VACCINES.some((vaccine) => vaccine.cost === undefined)).toBe(true);

    const rows = vaccineRows(profileWith({ cleared: clearedIds(CASES.length) }));
    VACCINES.forEach((vaccine, index) => {
      expect(rows[index]?.cost).toBe(vaccine.cost ?? '');
    });
  });
});

describe('seasonRows', () => {
  it('lists every case then every later entry, with days counted from today', () => {
    const fresh = createFreshProfile();
    const rows = seasonRows(fresh);
    const firstLater = LATER[0];
    if (firstLater === undefined) throw new Error('content has no later entries');

    expect(rows).toHaveLength(CASES.length + LATER.length);
    expect(rows.map((row) => row.name)).toEqual([
      ...CASES.map((definition) => definition.title),
      ...LATER.map((entry) => entry.name),
    ]);
    expect(rows[0]?.day).toBe(fresh.day);
    expect(rows[CASES.length]?.day).toBe(fresh.day + firstLater.offset);
  });

  it('marks the current case as now and a cleared one as done', () => {
    const profile = clearCase(createFreshProfile(), requireCase(0).id, 0);
    const rows = seasonRows(profile);

    expect(rows[0]?.state).toBe('done');
    expect(rows[1]?.state).toBe('now');
    expect(rows[2]?.state).toBe('next');
  });

  it('keeps the case you are on as today, whatever day the run has reached', () => {
    const profile = clearCase(createFreshProfile(), requireCase(0).id, 0);
    const rows = seasonRows(profile);

    expect(rows[0]?.day).toBe(profile.day - 1);
    expect(rows[1]?.day).toBe(profile.day);
    expect(rows[2]?.day).toBe(profile.day + 1);
  });

  it('notes a cleared region as holding and says nothing about one still ahead', () => {
    const rows = seasonRows(clearCase(createFreshProfile(), requireCase(0).id, 0));
    expect(rows[0]?.note).not.toBe('');
    expect(rows[1]?.note).toBe('');
  });

  it('names each region without the fight screen kicker', () => {
    const rows = seasonRows(createFreshProfile());
    CASES.forEach((definition, index) => {
      const region = rows[index]?.region ?? '';
      expect(region).not.toBe('');
      expect(region).not.toContain('·');
      expect(definition.region.toUpperCase()).toContain(region.toUpperCase());
      expect(region).toBe(region.charAt(0).toUpperCase() + region.slice(1).toLowerCase());
    });
  });

  it('marks an invented strain unknown and a named one a warning', () => {
    const rows = seasonRows(createFreshProfile());
    LATER.forEach((entry, index) => {
      expect(rows[CASES.length + index]?.state).toBe(entry.tier === 3 ? 'unknown' : 'warn');
      expect(rows[CASES.length + index]?.tier).toBe(entry.tier);
    });
  });
});
