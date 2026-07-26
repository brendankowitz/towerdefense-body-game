import { Container, Graphics } from 'pixi.js';
import type { SimState } from '@game/types';
import { defenderHex } from '../colors';
import { thickLine } from '../shapes';

/** Prototype line 887: an execute lands wider than a shot. */
const WIDE_SOURCE = 'nk';
const WIDE_WIDTH = 7;
const NARROW_WIDTH = 4;
const BEAM_ALPHA = 0.85;

/**
 * A beam is not an entity: it has no id to pool by, it lives about a fifth of a second and
 * there are a handful at a time. One cleared-and-redrawn Graphics is both the simplest and
 * the cheapest thing here — the cost this renderer actually has to avoid is a display
 * object per enemy per frame, and that lives in EnemyLayer.
 */
export class BeamLayer {
  readonly container: Container;
  readonly #graphics = new Graphics();

  constructor() {
    this.container = this.#graphics;
  }

  draw(state: SimState): void {
    this.#graphics.clear();
    for (const beam of state.beams) {
      const width = beam.source === WIDE_SOURCE ? WIDE_WIDTH : NARROW_WIDTH;
      thickLine(
        this.#graphics, beam.fromX, beam.fromY, beam.toX, beam.toY,
        defenderHex(beam.source), width, BEAM_ALPHA,
      );
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
