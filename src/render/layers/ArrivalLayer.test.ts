import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { ARRIVAL_USES } from '@game/content/rules';
import { arrivedAt, mountPosition, simFor } from '@game/testing';
import type { Arrival, SimState } from '@game/types';
import { GROWTH_SECONDS } from '../effects';
import { ArrivalLayer } from './ArrivalLayer';

/** A frame that advances nothing. Most of these assertions are about a still picture. */
const STILL = 0;

/** Every mark the layer is currently showing. Arrivals are the only thing in its container. */
function marks(layer: ArrivalLayer): Graphics[] {
  return layer.container.children.filter(
    (child): child is Graphics => child instanceof Graphics && child.visible,
  );
}

/** The mark drawn for the arrival standing at this mount. There is at most one per mount. */
function bodyAt(layer: ArrivalLayer, x: number, y: number): Graphics {
  const [body] = marks(layer).filter(
    (child) => child.position.x === x && child.position.y === y,
  );
  if (body === undefined) throw new Error(`No arrival drawn at ${String(x)}, ${String(y)}`);
  return body;
}

/** How many marks a drawing is filled from — one per use left, and nothing else in the drawing
 * is a fill: the socket and the entrance ring are both strokes. */
function fillCount(g: Graphics): number {
  return g.context.instructions.filter((instruction) => instruction.action === 'fill').length;
}

/** The colour a drawing's first fill was laid down in. */
function firstFillColor(g: Graphics): number {
  const [instruction] = g.context.instructions.filter((entry) => entry.action === 'fill');
  if (instruction === undefined || instruction.action !== 'fill') {
    throw new Error('The drawing has no fill to read a colour from');
  }
  return instruction.data.style.color;
}

function withArrival(state: SimState, mountIndex: number, arrival: Arrival): void {
  state.arrivals = [...state.arrivals.filter((entry) => entry.mountIndex !== mountIndex), arrival];
}

describe('ArrivalLayer', () => {
  it('draws something at the mount an arrival is standing on', () => {
    const state = arrivedAt(0, 'antibody');
    const layer = new ArrivalLayer(state.caseId);

    layer.draw(state, STILL, 'full');

    const { x, y } = mountPosition(state, 0);
    expect(marks(layer)).toHaveLength(1);
    expect(bodyAt(layer, x, y)).toBeDefined();
    layer.destroy();
  });

  it('draws nothing when no arrival has landed', () => {
    const state = simFor();
    const layer = new ArrivalLayer(state.caseId);

    layer.draw(state, STILL, 'full');

    expect(marks(layer)).toHaveLength(0);
    layer.destroy();
  });

  it('takes the mark away with the arrival that leaves', () => {
    const state = arrivedAt(0, 'antibody');
    const layer = new ArrivalLayer(state.caseId);
    layer.draw(state, STILL, 'full');
    expect(marks(layer)).toHaveLength(1);

    state.arrivals = [];
    layer.draw(state, STILL, 'full');

    expect(marks(layer)).toHaveLength(0);
    layer.destroy();
  });

  it('marks a killer arrival in a different colour than an antibody one', () => {
    const antibody = arrivedAt(0, 'antibody');
    const antibodyLayer = new ArrivalLayer(antibody.caseId);
    antibodyLayer.draw(antibody, STILL, 'full');

    const killer = arrivedAt(0, 'killer');
    const killerLayer = new ArrivalLayer(killer.caseId);
    killerLayer.draw(killer, STILL, 'full');

    const { x, y } = mountPosition(antibody, 0);
    expect(firstFillColor(bodyAt(killerLayer, x, y)))
      .not.toBe(firstFillColor(bodyAt(antibodyLayer, x, y)));

    antibodyLayer.destroy();
    killerLayer.destroy();
  });

  /**
   * The entrance, and the two things that make it one rather than a permanent extra ring: it
   * starts the frame an arrival lands, and it ends on its own. Mirrors `TowerLayer`'s growth
   * flourish tests, because it is the same flourish reused for the same reason.
   */
  it('marks the moment an arrival lands, and stops on its own', () => {
    const layer = new ArrivalLayer('forearm');
    const state = simFor();
    state.arrivals = [];
    layer.draw(state, STILL, 'full');

    withArrival(state, 0, { mountIndex: 0, kind: 'antibody', uses: ARRIVAL_USES });
    layer.draw(state, STILL, 'full');
    const { x, y } = mountPosition(state, 0);
    const landing = bodyAt(layer, x, y).context.instructions.length;

    // Past the end of the effect in one frame: what is left is the socket the arrival keeps.
    layer.draw(state, GROWTH_SECONDS, 'full');
    const settled = bodyAt(layer, x, y).context.instructions.length;

    expect(landing, 'the entrance drew nothing extra on the frame it happened')
      .toBeGreaterThan(settled);
    layer.destroy();
  });

  it('never plays the entrance for an arrival already on the mount when the board appears', () => {
    const layer = new ArrivalLayer('forearm');
    const state = arrivedAt(0, 'antibody');
    layer.draw(state, STILL, 'full');
    const { x, y } = mountPosition(state, 0);
    const first = bodyAt(layer, x, y).context.instructions.length;

    layer.draw(state, GROWTH_SECONDS, 'full');
    expect(bodyAt(layer, x, y).context.instructions.length).toBe(first);
    layer.destroy();
  });

  it('drops the entrance under reduced motion, and keeps the count', () => {
    const layer = new ArrivalLayer('forearm');
    const state = simFor();
    state.arrivals = [];
    layer.draw(state, STILL, 'reduced');

    withArrival(state, 0, { mountIndex: 0, kind: 'antibody', uses: ARRIVAL_USES });
    layer.draw(state, STILL, 'reduced');
    const { x, y } = mountPosition(state, 0);
    const landing = bodyAt(layer, x, y).context.instructions.length;

    layer.draw(state, GROWTH_SECONDS, 'reduced');
    expect(bodyAt(layer, x, y).context.instructions.length).toBe(landing);
    expect(fillCount(bodyAt(layer, x, y))).toBe(ARRIVAL_USES);
    layer.destroy();
  });

  /**
   * What is left, in marks a player can count. This is the reading the whole task exists for —
   * ammunition the player cannot count is a timer wearing a different hat — so it is asserted
   * directly against `uses` rather than against a radius or an alpha.
   */
  describe('the count of uses left', () => {
    it('draws one mark per use, and fewer once some are spent', () => {
      const full = arrivedAt(0, 'antibody');
      const fullLayer = new ArrivalLayer(full.caseId);
      fullLayer.draw(full, STILL, 'full');

      const spent = arrivedAt(0, 'antibody');
      withArrival(spent, 0, { mountIndex: 0, kind: 'antibody', uses: 1 });
      const spentLayer = new ArrivalLayer(spent.caseId);
      spentLayer.draw(spent, STILL, 'full');

      const { x, y } = mountPosition(full, 0);
      expect(fillCount(bodyAt(fullLayer, x, y))).toBe(ARRIVAL_USES);
      expect(fillCount(bodyAt(spentLayer, x, y))).toBe(1);

      fullLayer.destroy();
      spentLayer.destroy();
    });

    it('repaints when a use is spent, rather than keeping the old count on screen', () => {
      const state = arrivedAt(0, 'antibody');
      const layer = new ArrivalLayer(state.caseId);
      layer.draw(state, STILL, 'full');
      const { x, y } = mountPosition(state, 0);
      const before = fillCount(bodyAt(layer, x, y));

      const [arrival] = state.arrivals;
      if (arrival === undefined) throw new Error('arrivedAt did not land an arrival');
      withArrival(state, 0, { ...arrival, uses: arrival.uses - 1 });
      layer.draw(state, STILL, 'full');

      expect(fillCount(bodyAt(layer, x, y))).toBe(before - 1);
      layer.destroy();
    });
  });
});
