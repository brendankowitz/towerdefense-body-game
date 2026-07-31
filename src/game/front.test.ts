import { describe, expect, it } from 'vitest';
import { CASE_REGIONS } from './content/body';
import { SIEGE_BASE_DAYS } from './content/rules';
import { createFront, hotCases, stateOf, stepSickness, type Front } from './front';
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
