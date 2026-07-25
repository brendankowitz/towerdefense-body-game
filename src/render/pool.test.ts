import { beforeEach, describe, expect, it } from 'vitest';
import { ViewPool, type ViewHandlers } from './pool';

interface FakeView {
  readonly serial: number;
  attached: boolean;
  destroyed: boolean;
}

interface Harness {
  readonly pool: ViewPool<FakeView>;
  readonly views: FakeView[];
}

function harness(): Harness {
  const views: FakeView[] = [];
  const handlers: ViewHandlers<FakeView> = {
    create: () => {
      const view: FakeView = { serial: views.length, attached: false, destroyed: false };
      views.push(view);
      return view;
    },
    attach: (view) => { view.attached = true; },
    detach: (view) => { view.attached = false; },
    destroy: (view) => { view.destroyed = true; },
  };
  return { pool: new ViewPool(handlers), views };
}

/** One frame of a layer: begin, touch the ids that are still alive, end. */
function frame(pool: ViewPool<FakeView>, ids: readonly number[]): void {
  pool.beginFrame();
  for (const id of ids) pool.acquire(id);
  pool.endFrame();
}

describe('ViewPool', () => {
  let pool: ViewPool<FakeView>;
  let views: FakeView[];

  beforeEach(() => {
    ({ pool, views } = harness());
  });

  it('creates one view per id on the frame the ids appear', () => {
    frame(pool, [1, 2, 3]);
    expect(pool.createdCount).toBe(3);
    expect(pool.activeCount).toBe(3);
    expect(views.every((v) => v.attached)).toBe(true);
  });

  it('hands the same view back to the same id across frames', () => {
    pool.beginFrame();
    const first = pool.acquire(7);
    pool.endFrame();

    pool.beginFrame();
    const second = pool.acquire(7);
    pool.endFrame();

    expect(second).toBe(first);
    expect(pool.createdCount).toBe(1);
  });

  it('hands the same view back twice within one frame', () => {
    pool.beginFrame();
    expect(pool.acquire(7)).toBe(pool.acquire(7));
    pool.endFrame();
    expect(pool.createdCount).toBe(1);
  });

  it('detaches the view of an entity that dies', () => {
    frame(pool, [1, 2]);
    const dying = views[0];
    expect(dying).toBeDefined();

    frame(pool, [2]);

    expect(dying?.attached).toBe(false);
    expect(dying?.destroyed).toBe(false);
    expect(pool.activeCount).toBe(1);
    expect(pool.freeCount).toBe(1);
  });

  it('reuses a dead entity view for the next entity rather than creating one', () => {
    frame(pool, [1]);
    frame(pool, []);
    frame(pool, [2]);

    expect(pool.createdCount).toBe(1);
    expect(views).toHaveLength(1);
    expect(views[0]?.attached).toBe(true);
  });

  it('does not grow past the peak number of simultaneous entities', () => {
    let nextId = 1;
    // A wave: churn a hundred entities through, never more than four alive at once.
    for (let wave = 0; wave < 25; wave += 1) {
      const ids = [nextId, nextId + 1, nextId + 2, nextId + 3];
      nextId += 4;
      frame(pool, ids);
      frame(pool, []);
    }

    expect(pool.createdCount).toBe(4);
  });

  it('holds a dead view one frame, so a turnover frame needs headroom over the peak', () => {
    frame(pool, [1, 2]);
    frame(pool, [1, 2, 3, 4, 5]);
    frame(pool, [3]);
    frame(pool, [6, 7, 8, 9, 10]);

    // Six, not five: id 3 was still active while the five newcomers were acquired, and is
    // only released at the end of that frame. Never more than one frame of lag.
    expect(pool.createdCount).toBe(6);
    expect(pool.activeCount).toBe(5);
  });

  it('stops growing under indefinite churn, whatever the turnover', () => {
    // The harshest shape there is: the entire population replaced every single frame.
    for (let generation = 0; generation < 5; generation += 1) {
      frame(pool, [generation * 5 + 1, generation * 5 + 2, generation * 5 + 3]);
    }
    const settled = pool.createdCount;
    expect(settled).toBeLessThanOrEqual(3 * 2);

    for (let generation = 5; generation < 200; generation += 1) {
      frame(pool, [generation * 5 + 1, generation * 5 + 2, generation * 5 + 3]);
    }
    expect(pool.createdCount).toBe(settled);
  });

  it('settles at one over the window for the gradual churn a wave actually produces', () => {
    // One spawns, one dies, four alive — which is what a wave looks like frame to frame.
    const window = 4;
    const slide = (id: number): void => {
      frame(pool, Array.from({ length: window }, (_, offset) => id + offset));
    };

    for (let id = 1; id <= 20; id += 1) slide(id);
    expect(pool.createdCount).toBe(window + 1);

    for (let id = 21; id <= 500; id += 1) slide(id);
    expect(pool.createdCount).toBe(window + 1);
  });

  it('leaves nothing attached once every entity is gone', () => {
    frame(pool, [1, 2, 3]);
    frame(pool, []);

    expect(pool.activeCount).toBe(0);
    expect(pool.freeCount).toBe(3);
    expect(views.some((v) => v.attached)).toBe(false);
  });

  it('re-attaches a recycled view, so it is never reused while hidden', () => {
    frame(pool, [1]);
    frame(pool, []);
    expect(views[0]?.attached).toBe(false);

    frame(pool, [2]);
    expect(views[0]?.attached).toBe(true);
  });

  it('destroys both live and free views on teardown', () => {
    frame(pool, [1, 2, 3]);
    frame(pool, [1]);
    pool.destroyAll();

    expect(views).toHaveLength(3);
    expect(views.every((v) => v.destroyed)).toBe(true);
    expect(pool.activeCount).toBe(0);
    expect(pool.freeCount).toBe(0);
  });

  it('survives an id that dies and is reborn on the same frame boundary', () => {
    frame(pool, [1]);
    const original = views[0];
    frame(pool, []);
    frame(pool, [1]);

    expect(pool.createdCount).toBe(1);
    expect(original?.attached).toBe(true);
  });
});
