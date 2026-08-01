import { describe, expect, it } from 'vitest';
import { CASE_REGIONS, ENTRY_REGIONS } from './content/body';
import { DOOR_RESIST_PER_CLEAR, IMMUNITY_MAX, OUTBREAK_INTERVAL, SIEGE_BASE_DAYS } from './content/rules';
import {
  createFront, endDay, heldRegionCount, holdCore, holdRegion, hotCases, isCoreBesieged, isLastStand,
  isRunLost, isRunWon, loseCore, seedOutbreak, shoreUp, stateOf, stepSickness, wallDays, wallStatus,
  type Front,
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
    const before: Front = { infected: ['footL'], held: [], siege: {}, day: 1, rngState: 1, lost: false };
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
      infected: ['footL', 'handR', 'sinus'], held: [], siege: {}, day: 1, rngState: 1, lost: false,
    };
    const after = stepSickness(before, NO_IMMUNITY);
    expect(after.infected).toHaveLength(before.infected.length + 1);
  });

  /** Held ground is a wall: the step is spent on the siege and takes no new ground. */
  it('cannot walk through ground the player holds', () => {
    const before: Front = { infected: ['stomach'], held: ['gut'], siege: {}, day: 1, rngState: 1, lost: false };
    const after = stepSickness(before, NO_IMMUNITY);

    expect(after.infected).toEqual(before.infected);
    expect(after.siege.gut).toBe(SIEGE_BASE_DAYS - 1 + 0);
  });

  it('takes a wall once its days run out, and the region stops being held', () => {
    const under: Front = { infected: ['stomach'], held: ['gut'], siege: { gut: 0 }, day: 1, rngState: 1, lost: false };
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
    const oneRoad: Front = { infected: ['throat'], held: [], siege: {}, day: 1, rngState: 1, lost: false };
    expect(stepSickness(oneRoad, NO_IMMUNITY).infected).not.toContain('heart');

    const allRoads: Front = { infected: [...CORE_ROADS], held: [], siege: {}, day: 9, rngState: 1, lost: false };
    expect(stepSickness(allRoads, NO_IMMUNITY).infected).toContain('heart');
  });

  /**
   * A held heart is not ordinary held ground: it must not come under siege either, or the wall
   * would start coming down the moment any one road opened, which quietly deletes the rule above.
   */
  it('leaves a held core alone until every road to it has fallen', () => {
    const oneRoadOpen: Front = {
      infected: CORE_ROADS.slice(1), held: ['heart'], siege: {}, day: 9, rngState: 1, lost: false,
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
    const before: Front = { infected: ['stomach'], held: ['gut'], siege: {}, day: 1, rngState: 1, lost: false };
    const after = stepSickness(before, NO_IMMUNITY, { wallsCannotFall: true });

    expect(after.siege.gut, 'a wall started under a rule that says none can').toBeUndefined();
    expect(after.held).toContain('gut');
    expect(after.infected).toEqual(before.infected);
  });

  it('keeps a wall from falling even once its days would have run out', () => {
    const under: Front = { infected: ['stomach'], held: ['gut'], siege: { gut: 0 }, day: 1, rngState: 1, lost: false };
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
    const midSiege: Front = { infected: ['stomach'], held: ['gut'], siege: { gut: 2 }, day: 1, rngState: 1, lost: false };
    const after = stepSickness(midSiege, NO_IMMUNITY, { wallsCannotFall: true });

    expect(after.siege.gut, 'a siege that started before the vaccine kept counting down').toBeUndefined();
    expect(after.held).toContain('gut');
    expect(after.infected).not.toContain('gut');
  });

  it('forwards the same rule through endDay', () => {
    const under: Front = { infected: ['stomach'], held: ['gut'], siege: { gut: 0 }, day: 1, rngState: 1, lost: false };
    const after = endDay(under, NO_IMMUNITY, { wallsCannotFall: true });

    expect(after.held).toContain('gut');
    expect(after.infected).not.toContain('gut');
  });

  /**
   * "Stops a cleared case reopening" is a promise about the whole day, and a wall coming down is
   * only one of the two ways a cleared region can reopen — a new outbreak at the door is the
   * other, and every case region the sickness can enter at is a door. Walked over many seeds
   * because the door a seeding day picks is a roll: one seed proves nothing about the ones the
   * player will actually get.
   */
  it('never lets a new outbreak reopen a cleared door', () => {
    const doors = ENTRY_REGIONS.map((n) => n.id);
    for (let seed = 1; seed <= 40; seed += 1) {
      const held: Front = {
        infected: [], held: doors, siege: {}, day: OUTBREAK_INTERVAL - 1, rngState: seed, lost: false,
      };
      const after = endDay(held, FULL_IMMUNITY, { wallsCannotFall: true });
      const reopened = after.infected.filter((node) => doors.includes(node));
      expect(reopened, `a cleared door reopened at seed ${String(seed)}`).toEqual([]);
    }
  });
});

describe('new outbreaks open doors', () => {
  it('opens nothing on a day that is not a seeding day', () => {
    const front: Front = { infected: ['footL'], held: [], siege: {}, day: 1, rngState: 3, lost: false };
    expect(seedOutbreak(front, NO_IMMUNITY).infected).toEqual(front.infected);
  });

  it('opens a door on a seeding day', () => {
    const front: Front = {
      infected: ['footL'], held: [], siege: {}, day: OUTBREAK_INTERVAL, rngState: 3, lost: false,
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
          infected: [], held: [], siege: {}, day: OUTBREAK_INTERVAL, rngState: seed, lost: false,
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
      infected: ENTRY_REGIONS.map((n) => n.id), held: [], siege: {}, day: OUTBREAK_INTERVAL, rngState: 3, lost: false,
    };
    expect(seedOutbreak(front, NO_IMMUNITY).infected).toEqual(front.infected);
  });

  /** The counterpart: a door the player is standing on is a door the sickness cannot come back in at. */
  it('never opens a door on ground the player holds', () => {
    const front: Front = {
      infected: [], held: ENTRY_REGIONS.map((n) => n.id), siege: {}, day: OUTBREAK_INTERVAL, rngState: 3, lost: false,
    };
    expect(seedOutbreak(front, NO_IMMUNITY).infected).toEqual([]);
  });

  /**
   * The state the whole filter exists to keep out of reach, walked rather than argued: a node in
   * `infected` and `held` at once. Nothing in this module can undo it — `stepSickness` only ever
   * opens a siege against ground that is not already infected, so no siege is ever opened against
   * such a region and it never leaves `held` — and while it sits there `stateOf` reads `hot` over
   * a wall the map still offers to reinforce, and `isRunWon` counts it toward a win with the
   * sickness standing on it.
   *
   * Walked at full immunity because that is the *most* resistant body the game can produce: if
   * the strongest body still reaches the state, every weaker one reaches it sooner.
   */
  it('never leaves a region in both lists, over a long run at full immunity', () => {
    const doors = ENTRY_REGIONS.map((n) => n.id);
    for (let seed = 1; seed <= 40; seed += 1) {
      let front: Front = { infected: [], held: doors, siege: {}, day: 1, rngState: seed, lost: false };
      for (let step = 0; step < 60; step += 1) {
        front = endDay(front, FULL_IMMUNITY);
        const both = front.held.filter((node) => front.infected.includes(node));
        expect(both, `seed ${String(seed)}, day ${String(front.day)}`).toEqual([]);
      }
    }
  });
});

/**
 * The one place a wall's countdown is put into words — `MapPage.tsx`'s wall list and
 * `progression.ts`'s `seasonRows` both call this rather than each spelling out the same
 * pluralisation rule, which is what let the two of them say different things about the same wall
 * before this was written.
 */
describe('wallStatus', () => {
  it('reads an unbesieged wall as holding', () => {
    const front: Front = { infected: [], held: ['gut'], siege: {}, day: 1, rngState: 1, lost: false };
    expect(wallStatus(front, 'gut')).toBe('Holding');
  });

  it('reads a wall with one day left as singular', () => {
    const front: Front = { infected: [], held: ['gut'], siege: { gut: 1 }, day: 1, rngState: 1, lost: false };
    expect(wallStatus(front, 'gut')).toBe('1 day left');
  });

  it('reads a wall with more than one day left as plural', () => {
    const front: Front = { infected: [], held: ['gut'], siege: { gut: 3 }, day: 1, rngState: 1, lost: false };
    expect(wallStatus(front, 'gut')).toBe('3 days left');
  });

  /** Zero is not undefined: the wall is still held, one hit from falling, and still plural. */
  it('reads a wall at zero days left as plural, not as holding', () => {
    const front: Front = { infected: [], held: ['gut'], siege: { gut: 0 }, day: 1, rngState: 1, lost: false };
    expect(wallStatus(front, 'gut')).toBe('0 days left');
  });
});

describe('holding and losing the body', () => {
  it('turns a region the player cleared from hot to held', () => {
    const before: Front = { infected: ['forearm'], held: [], siege: {}, day: 1, rngState: 1, lost: false };
    const after = holdRegion(before, 'forearm');
    expect(after.infected).not.toContain('forearm');
    expect(after.held).toContain('forearm');
  });

  it('lifts a siege when the region under it is retaken', () => {
    const before: Front = {
      infected: ['stomach'], held: ['gut'], siege: { gut: 0 }, day: 1, rngState: 1, lost: false,
    };
    expect(holdRegion(before, 'stomach').siege.gut).toBe(0);
    expect(holdRegion({ ...before, infected: ['gut'] }, 'gut').siege.gut).toBeUndefined();
  });

  it('besieges the core only when every road to it is taken', () => {
    const most: Front = { infected: CORE_ROADS.slice(1), held: [], siege: {}, day: 1, rngState: 1, lost: false };
    expect(isCoreBesieged(most)).toBe(false);
    expect(isCoreBesieged({ ...most, infected: [...CORE_ROADS] })).toBe(true);
  });

  /**
   * The map's numerator, and the one the ending is stated in. Two things it must not count: the
   * core, which a won last stand puts in `held` and which is not a region a season is fought
   * over, and ground the run cleared once and has since lost.
   */
  describe('heldRegionCount', () => {
    it('counts held case regions and not the core', () => {
      const all = CASE_REGIONS.map((n) => n.id);
      const rallied: Front = {
        infected: [], held: [...all, 'heart'], siege: {}, day: 9, rngState: 1, lost: false,
      };
      expect(heldRegionCount(rallied)).toBe(CASE_REGIONS.length);
    });

    it('falls when the sickness retakes ground', () => {
      const all = CASE_REGIONS.map((n) => n.id);
      const [first] = all;
      if (first === undefined) throw new Error('content has no case regions');
      const held: Front = { infected: [], held: all, siege: {}, day: 9, rngState: 1, lost: false };
      const retaken: Front = { ...held, held: all.slice(1), infected: [first] };

      expect(heldRegionCount(held)).toBe(CASE_REGIONS.length);
      expect(heldRegionCount(retaken)).toBe(CASE_REGIONS.length - 1);
    });
  });

  it('is won when every region is held at once', () => {
    const all = CASE_REGIONS.map((n) => n.id);
    expect(isRunWon({ infected: [], held: all, siege: {}, day: 9, rngState: 1, lost: false })).toBe(true);
    expect(isRunWon({ infected: [], held: all.slice(1), siege: {}, day: 9, rngState: 1, lost: false })).toBe(false);
  });

  /**
   * The heart is not a case region, so holding the other ten is not by itself enough to call a
   * run won — the sickness can be standing on the core, mid last-stand, at the same time, and a
   * run cannot be won while that fight is still undecided. This state cannot actually arise from
   * play (a besieged core needs several case regions in enemy hands, which rules out holding all
   * ten) but `isRunWon` does not lean on that — it says so itself, by construction.
   */
  it('is not won while the last stand is in progress, however much other ground is held', () => {
    const everything = CASE_REGIONS.map((n) => n.id);
    const occupied: Front = { infected: ['heart'], held: everything, siege: {}, day: 20, rngState: 1, lost: false };

    expect(isRunLost(occupied), 'reaching the core is not losing it').toBe(false);
    expect(isRunWon(occupied), 'a run was won while the last stand was still undecided').toBe(false);
  });

  /**
   * Besieged, reached and lost are three different facts. Every road falling only besieges the
   * core; the sickness then takes the one open step onto it, which *reaches* the core and starts
   * the last stand — `hotCases` offers the heart case from here, and the run is not over. Only
   * losing that fight, recorded by `loseCore`, ends it. Collapsing "reached" into "lost" is
   * exactly the bug this case guards: it would end the run at the moment the last stand's fight
   * was supposed to begin, and the heart case could never be played.
   */
  it('is lost only once the last stand itself is lost, not merely reached', () => {
    const besieged: Front = { infected: [...CORE_ROADS], held: [], siege: {}, day: 9, rngState: 1, lost: false };
    expect(isCoreBesieged(besieged)).toBe(true);
    expect(isRunLost(besieged)).toBe(false);

    const reached: Front = { ...besieged, infected: [...CORE_ROADS, 'heart'] };
    expect(isRunLost(reached), 'reaching the core is not the same as losing the run').toBe(false);
    expect(hotCases(reached)).toContain('heart');

    expect(isRunLost(loseCore(reached))).toBe(true);
  });

  /** A won last stand, and the ground it was fought from: every road taken, plus a door elsewhere. */
  function coreReached(): Front {
    return {
      infected: [...CORE_ROADS, 'heart', 'footL'], held: [], siege: {}, day: 9, rngState: 1,
      lost: false,
    };
  }

  /**
   * Winning the last stand puts the body on the core and drives the sickness off every road to
   * it. Ground it holds anywhere else is untouched — the body rallied at the core, it did not win
   * the season, and the roads come back cold rather than held because nobody won the cases fought
   * over them.
   */
  it('drives the sickness off every road to the core when the last stand is won', () => {
    const after = holdCore(coreReached());

    expect(after.held).toEqual(['heart']);
    expect(after.infected).not.toContain('heart');
    for (const road of CORE_ROADS) {
      expect(after.infected, `the sickness still holds ${road} after the body rallied`)
        .not.toContain(road);
      expect(stateOf(after, road)).toBe('cold');
    }
    expect(after.infected, 'the rally took ground it was never fought over').toContain('footL');
    expect(isRunLost(after)).toBe(false);
  });

  /**
   * The reason winning clears more than the one node, stated as the thing that would otherwise
   * happen: `stepsToCore('heart')` is 0, so a sickness left standing on the roads picks the core
   * over everything else every day, breaks the wall, and hands back the same fight — with the
   * clear reward paid again each time round. Having to retake the roads first is what makes a won
   * last stand a reprieve rather than a loop.
   */
  it('cannot be besieged again the day after the last stand is won', () => {
    let front = holdCore(coreReached());

    for (let day = 0; day < CORE_ROADS.length; day += 1) {
      front = endDay(front, NO_IMMUNITY);
      expect(isCoreBesieged(front), `the core was besieged again ${String(day + 1)} days after the rally`)
        .toBe(false);
      expect(front.infected, 'the sickness was back on the core').not.toContain('heart');
      expect(hotCases(front), 'the last stand was offered again').not.toContain('heart');
      expect(front.siege.heart, 'the core wall was being knocked on with a road still open')
        .toBeUndefined();
      expect(front.held, 'the body lost the core without a fight').toContain('heart');
    }
  });

  it('names the last stand as the one case fought on the core', () => {
    expect(isLastStand('heart')).toBe(true);
    expect(isLastStand('forearm')).toBe(false);
  });

  it('adds a day to a wall when a region is shored up', () => {
    const front: Front = { infected: [], held: ['throat'], siege: {}, day: 2, rngState: 1, lost: false };
    expect(shoreUp(front, 'throat', NO_IMMUNITY).siege.throat)
      .toBe(wallDays('throat', NO_IMMUNITY) + 1);
  });

  it('advances the day and steps the sickness', () => {
    const before: Front = { infected: ['footL'], held: [], siege: {}, day: 1, rngState: 1, lost: false };
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
      infected: ['footL'], held: [], siege: {}, day: OUTBREAK_INTERVAL - 1, rngState: 1, lost: false,
    };
    const after = endDay(before, NO_IMMUNITY);
    const doorsHeld = (front: Front): number => front.infected
      .filter((id) => ENTRY_REGIONS.some((n) => n.id === id)).length;

    expect(after.day).toBe(OUTBREAK_INTERVAL);
    expect(doorsHeld(after)).toBeGreaterThan(doorsHeld(before));
  });
});
