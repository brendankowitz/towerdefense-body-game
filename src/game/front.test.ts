import { describe, expect, it } from 'vitest';
import { CASE_REGIONS } from './content/body';
import { createFront, hotCases, stateOf } from './front';

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
