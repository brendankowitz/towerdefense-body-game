import { describe, expect, it } from 'vitest';
import { CASE_REGIONS, ENTRY_REGIONS } from './content/body';
import { DOOR_RESIST_PER_CLEAR, IMMUNITY_MAX, OUTBREAK_INTERVAL, SIEGE_BASE_DAYS } from './content/rules';
import {
  createFront, endDay, holdRegion, hotCases, isCoreBesieged, isRunLost, isRunWon, seedOutbreak,
  shoreUp, stateOf, stepSickness, wallDays, type Front,
} from './front';
import { CORE_ROADS, stepsToCore } from './graph';
import type { StrainId } from './types';

const SEED = 7;

describe('a fresh front', () => {
  it('starts with one region under attack and everything else untouched', () => {
    const front = createFront(SEED);
    const hot = CASE_REGIONS.filter((n) => stateOf(front, n.id) === 'hot');
    expect(hot).toHaveLength(1);
    expect(hotCases(front)).toHaveLength(1);
  });

  it('starts the sickness at a door, never somewhere it could not have got in', () => {
    const front = createFront(SEED);
    const [first] = front.infected;
    expect(first).toBeDefined();
    const node = CASE_REGIONS.find((n) => n.id === first);
    expect(node?.entry, 'the sickness started somewhere it could not have entered').toBe(true);
  });

  it('holds nothing and has spent no days', () => {
    const front = createFront(SEED);
    expect(front.held).toEqual([]);
    expect(front.day).toBe(1);
  });

  it('reads every other region as cold, including the core', () => {
    const front = createFront(SEED);
    expect(stateOf(front, 'heart')).toBe('cold');
    expect(stateOf(front, 'footR')).toBe('cold');
  });
});

const NO_IMMUNITY: Readonly<Record<StrainId, number>> = { staph: 0, film: 0, virus: 0 } as const;
const FULL_IMMUNITY = { staph: IMMUNITY_MAX, film: IMMUNITY_MAX, virus: IMMUNITY_MAX } as const;

describe('the sickness takes one step a day', () => {
  it('moves toward the core rather than wandering', () => {
    const before: Front = { infected: ['footL'], held: [], siege: {}, day: 1, rngState: 1 };
    const after = stepSickness(before, NO_IMMUNITY);

    const taken = after.infected.filter((node) => !before.infected.includes(node));
    expect(taken).toHaveLength(1);
    const [next] = taken;
    expect(next).toBeDefined();
    if (next === undefined) return;
    expect(stepsToCore(next)).toBeLessThan(stepsToCore('footL'));
  });

  it('takes exactly one node however many fronts it has', () => {
    const before: Front = {
      infected: ['footL', 'handR', 'sinus'], held: [], siege: {}, day: 1, rngState: 1,
    };
    const after = stepSickness(before, NO_IMMUNITY);
    expect(after.infected).toHaveLength(before.infected.length + 1);
  });

  /** Held ground is a wall: the step is spent on the siege and takes no new ground. */
  it('cannot walk through ground the player holds', () => {
    const before: Front = { infected: ['stomach'], held: ['gut'], siege: {}, day: 1, rngState: 1 };
    const after = stepSickness(before, NO_IMMUNITY);

    expect(after.infected).toEqual(before.infected);
    expect(after.siege.gut).toBe(SIEGE_BASE_DAYS - 1 + 0);
  });

  it('takes a wall once its days run out, and the region stops being held', () => {
    const under: Front = { infected: ['stomach'], held: ['gut'], siege: { gut: 0 }, day: 1, rngState: 1 };
    const after = stepSickness(under, NO_IMMUNITY);

    expect(after.held).not.toContain('gut');
    expect(after.infected).toContain('gut');
    expect(after.siege.gut).toBeUndefined();
  });

  /**
   * The core is the nearest node to the core, so a step that only sorted by distance would walk
   * onto the heart the moment the sickness reached any one road — and the campaign the whole
   * design is built on would never happen. The heart is off the table until every road is taken.
   */
  it('will not step onto the core while a single road to it is open', () => {
    const oneRoad: Front = { infected: ['throat'], held: [], siege: {}, day: 1, rngState: 1 };
    expect(stepSickness(oneRoad, NO_IMMUNITY).infected).not.toContain('heart');

    const allRoads: Front = { infected: [...CORE_ROADS], held: [], siege: {}, day: 9, rngState: 1 };
    expect(stepSickness(allRoads, NO_IMMUNITY).infected).toContain('heart');
  });

  /**
   * A held heart is not ordinary held ground: it must not come under siege either, or the wall
   * would start coming down the moment any one road opened, which quietly deletes the rule above.
   */
  it('leaves a held core alone until every road to it has fallen', () => {
    const oneRoadOpen: Front = {
      infected: CORE_ROADS.slice(1), held: ['heart'], siege: {}, day: 9, rngState: 1,
    };
    const after = stepSickness(oneRoadOpen, NO_IMMUNITY);
    expect(after.siege.heart, 'the core was besieged with a road still open').toBeUndefined();
    expect(after.held).toContain('heart');
  });
});

/**
 * Chickenpox's whole effect, exercised on `stepSickness` and `endDay` directly rather than through
 * a profile — `front.ts` never knows a vaccine exists, only the fact `wallsCannotFall` it was
 * handed, so that is the only thing these tests give it.
 */
describe('Chickenpox: walls that cannot fall', () => {
  it('never lets held ground come under siege at all', () => {
    const before: Front = { infected: ['stomach'], held: ['gut'], siege: {}, day: 1, rngState: 1 };
    const after = stepSickness(before, NO_IMMUNITY, { wallsCannotFall: true });

    expect(after.siege.gut, 'a wall started under a rule that says none can').toBeUndefined();
    expect(after.held).toContain('gut');
    expect(after.infected).toEqual(before.infected);
  });

  it('keeps a wall from falling even once its days would have run out', () => {
    const under: Front = { infected: ['stomach'], held: ['gut'], siege: { gut: 0 }, day: 1, rngState: 1 };
    const after = stepSickness(under, NO_IMMUNITY, { wallsCannotFall: true });

    expect(after.held).toContain('gut');
    expect(after.infected).not.toContain('gut');
  });

  /**
   * A region already mid-siege the day the gate is crossed is the case the two tests above cannot
   * tell apart from a bug: dropping a held node from `options` stops the countdown moving, but a
   * `front` returned unchanged still carries whatever count it stopped at. Asserted on `siege`
   * directly, not just on `held`/`infected`, because those two stayed correct even before this was
   * fixed — the wall never fell, it just sat on the map still claiming to be under attack.
   */
  it('lifts a siege already in progress once the gate is crossed', () => {
    const midSiege: Front = { infected: ['stomach'], held: ['gut'], siege: { gut: 2 }, day: 1, rngState: 1 };
    const after = stepSickness(midSiege, NO_IMMUNITY, { wallsCannotFall: true });

    expect(after.siege.gut, 'a siege that started before the vaccine kept counting down').toBeUndefined();
    expect(after.held).toContain('gut');
    expect(after.infected).not.toContain('gut');
  });

  it('forwards the same rule through endDay', () => {
    const under: Front = { infected: ['stomach'], held: ['gut'], siege: { gut: 0 }, day: 1, rngState: 1 };
    const after = endDay(under, NO_IMMUNITY, { wallsCannotFall: true });

    expect(after.held).toContain('gut');
    expect(after.infected).not.toContain('gut');
  });
});

describe('new outbreaks open doors', () => {
  it('opens nothing on a day that is not a seeding day', () => {
    const front: Front = { infected: ['footL'], held: [], siege: {}, day: 1, rngState: 3 };
    expect(seedOutbreak(front, NO_IMMUNITY).infected).toEqual(front.infected);
  });

  it('opens a door on a seeding day', () => {
    const front: Front = {
      infected: ['footL'], held: [], siege: {}, day: OUTBREAK_INTERVAL, rngState: 3,
    };
    const after = seedOutbreak(front, NO_IMMUNITY);
    expect(after.infected.length).toBe(front.infected.length + 1);
  });

  /**
   * The door roll, asserted as a rate rather than as one outcome: a single draw proves nothing
   * about a probability. Walked over many seeds, a body that has met everything three times must
   * shrug off far more than a body that has met nothing.
   */
  it('shrugs off more outbreaks the more immunity the body carries', () => {
    const attempts = 400;
    const caught = (immunity: Readonly<Record<StrainId, number>>): number => {
      let count = 0;
      for (let seed = 1; seed <= attempts; seed += 1) {
        const front: Front = {
          infected: [], held: [], siege: {}, day: OUTBREAK_INTERVAL, rngState: seed,
        };
        if (seedOutbreak(front, immunity).infected.length > 0) count += 1;
      }
      return count;
    };

    const naive = caught(NO_IMMUNITY);
    const seasoned = caught(FULL_IMMUNITY);
    expect(naive, 'a body with no immunity should catch nearly everything').toBeGreaterThan(attempts * 0.9);
    expect(seasoned, 'a seasoned body should shrug most of it off').toBeLessThan(naive);
    expect(DOOR_RESIST_PER_CLEAR * IMMUNITY_MAX).toBeLessThanOrEqual(1);
  });

  it('never opens a door the sickness is already standing in', () => {
    const front: Front = {
      infected: ENTRY_REGIONS.map((n) => n.id), held: [], siege: {}, day: OUTBREAK_INTERVAL, rngState: 3,
    };
    expect(seedOutbreak(front, NO_IMMUNITY).infected).toEqual(front.infected);
  });
});

describe('holding and losing the body', () => {
  it('turns a region the player cleared from hot to held', () => {
    const before: Front = { infected: ['forearm'], held: [], siege: {}, day: 1, rngState: 1 };
    const after = holdRegion(before, 'forearm');
    expect(after.infected).not.toContain('forearm');
    expect(after.held).toContain('forearm');
  });

  it('lifts a siege when the region under it is retaken', () => {
    const before: Front = {
      infected: ['stomach'], held: ['gut'], siege: { gut: 0 }, day: 1, rngState: 1,
    };
    expect(holdRegion(before, 'stomach').siege.gut).toBe(0);
    expect(holdRegion({ ...before, infected: ['gut'] }, 'gut').siege.gut).toBeUndefined();
  });

  it('besieges the core only when every road to it is taken', () => {
    const most: Front = { infected: CORE_ROADS.slice(1), held: [], siege: {}, day: 1, rngState: 1 };
    expect(isCoreBesieged(most)).toBe(false);
    expect(isCoreBesieged({ ...most, infected: [...CORE_ROADS] })).toBe(true);
  });

  it('is won when every region is held at once', () => {
    const all = CASE_REGIONS.map((n) => n.id);
    expect(isRunWon({ infected: [], held: all, siege: {}, day: 9, rngState: 1 })).toBe(true);
    expect(isRunWon({ infected: [], held: all.slice(1), siege: {}, day: 9, rngState: 1 })).toBe(false);
  });

  /**
   * The heart is not a case region, so holding the other ten is not by itself enough to call a
   * run won — the sickness can be standing on the core at the same time, and a run cannot be won
   * and lost at once.
   */
  it('is not won while the sickness is standing on the core, however much ground is held', () => {
    const everything = CASE_REGIONS.map((n) => n.id);
    const occupied: Front = { infected: ['heart'], held: everything, siege: {}, day: 20, rngState: 1 };

    expect(isRunLost(occupied)).toBe(true);
    expect(isRunWon(occupied), 'a run was won and lost at the same time').toBe(false);
  });

  /**
   * The run ends when the sickness is *on* the core, which it can only be by winning the heart
   * case — being besieged is not being lost, and that gap is the whole last stand.
   */
  it('is lost only once the sickness is standing on the core', () => {
    const besieged: Front = { infected: [...CORE_ROADS], held: [], siege: {}, day: 9, rngState: 1 };
    expect(isCoreBesieged(besieged)).toBe(true);
    expect(isRunLost(besieged)).toBe(false);
    expect(isRunLost({ ...besieged, infected: [...CORE_ROADS, 'heart'] })).toBe(true);
  });

  /**
   * Winning the heart case does not clear the roads — it puts the player on the core, which the
   * sickness then has to break like any other wall. One rule, reused, and it means the last stand
   * buys time rather than resetting the campaign.
   */
  it('turns a won heart case into a wall the sickness has to break again', () => {
    const besieged: Front = { infected: [...CORE_ROADS, 'heart'], held: [], siege: {}, day: 9, rngState: 1 };
    const after = holdRegion(besieged, 'heart');
    expect(isRunLost(after)).toBe(false);
    expect(after.held).toContain('heart');
  });

  it('adds a day to a wall when a region is shored up', () => {
    const front: Front = { infected: [], held: ['throat'], siege: {}, day: 2, rngState: 1 };
    expect(shoreUp(front, 'throat', NO_IMMUNITY).siege.throat)
      .toBe(wallDays('throat', NO_IMMUNITY) + 1);
  });

  it('advances the day and steps the sickness', () => {
    const before: Front = { infected: ['footL'], held: [], siege: {}, day: 1, rngState: 1 };
    const after = endDay(before, NO_IMMUNITY);
    expect(after.day).toBe(2);
    expect(after.infected.length).toBeGreaterThan(before.infected.length);
  });

  /**
   * `day: 1` alone never proves `endDay` seeds — `2 % OUTBREAK_INTERVAL !== 0`, so that case's
   * growth is entirely `stepSickness`. This starts one day short of a seeding day so the day
   * `endDay` advances *to* is one, and counts entry regions specifically: stepping from a foot
   * walks inward through a connective joint, never onto another door, so only a seed can grow
   * that count.
   */
  it('opens a door as part of ending the day, on a day that seeds', () => {
    const before: Front = {
      infected: ['footL'], held: [], siege: {}, day: OUTBREAK_INTERVAL - 1, rngState: 1,
    };
    const after = endDay(before, NO_IMMUNITY);
    const doorsHeld = (front: Front): number => front.infected
      .filter((id) => ENTRY_REGIONS.some((n) => n.id === id)).length;

    expect(after.day).toBe(OUTBREAK_INTERVAL);
    expect(doorsHeld(after)).toBeGreaterThan(doorsHeld(before));
  });
});
