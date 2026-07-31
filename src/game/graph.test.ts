import { describe, expect, it } from 'vitest';
import { BODY_NODES } from './content/body';
import { CORE_ROADS, neighboursOf, stepsToCore } from './graph';

describe('the body as a graph', () => {
  it('gives the core a distance of nothing to itself', () => {
    expect(stepsToCore('heart')).toBe(0);
  });

  it('counts the steps a spreading sickness would actually take', () => {
    // heart → shoulder → forearm, and heart → stomach → gut → kneeL → footL.
    expect(stepsToCore('shoulder')).toBe(1);
    expect(stepsToCore('forearm')).toBe(2);
    expect(stepsToCore('footL')).toBe(4);
  });

  it('reaches every node in the body, so nothing is unreachable scenery', () => {
    for (const node of BODY_NODES) {
      expect(Number.isFinite(stepsToCore(node.id)), `${node.id} is cut off`).toBe(true);
    }
  });

  it('links are two-way — a neighbour of mine has me as a neighbour', () => {
    for (const node of BODY_NODES) {
      for (const other of neighboursOf(node.id)) {
        expect(neighboursOf(other), `${node.id} and ${other} disagree`).toContain(node.id);
      }
    }
  });

  /** What the heart falls to: everything one step from it, joints included. */
  it('names every road to the core', () => {
    expect([...CORE_ROADS].sort())
      .toEqual(['lungL', 'lungR', 'shoulder', 'shoulderR', 'stomach', 'throat'].sort());
  });
});
