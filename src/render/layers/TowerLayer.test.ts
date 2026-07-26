import { afterEach, describe, expect, it } from 'vitest';
import { Container, Graphics, Text } from 'pixi.js';
import { DEFENDERS } from '@game/content/defenders';
import { maturedFormOf } from '@game/content/maturation';
import { TOWER_MAX_HP } from '@game/content/rules';
import { applyDefenderTuning, applyMaturationTuning, resetTuning } from '@game/content/tuning';
import { createSimState } from '@game/state';
import type { MastTower, MemoryTower, SimState, Tower } from '@game/types';
import { BURST_SECONDS } from '../effects';
import type { Motion } from '../motion';
import { TowerLayer } from './TowerLayer';

function boardState(): SimState {
  return createSimState({
    caseId: 'forearm',
    immunity: { staph: 0, film: 0, virus: 0 },
    clearedCount: DEFENDERS.mem.unlock,
    totalKills: 0,
  });
}

function memoryCell(xp: number, spotIndex = 0): MemoryTower {
  return { kind: 'mem', spotIndex, x: 70, y: 118, hp: TOWER_MAX_HP, stun: 0, matured: false, cooldown: 0, xp };
}

function phagocyte(spotIndex = 1): Tower {
  return {
    kind: 'phago', spotIndex, x: 206, y: 88, hp: TOWER_MAX_HP, stun: 0, matured: false,
    holdingEnemyId: null, digested: 0, rest: 0,
  };
}

/** Every label the layer is currently showing, in scene-graph order. */
function visibleLabels(layer: TowerLayer): string[] {
  const labels: string[] = [];
  const walk = (node: { children: unknown[] }): void => {
    for (const child of node.children) {
      if (child instanceof Text) {
        if (child.visible) labels.push(child.text);
        continue;
      }
      walk(child as { children: unknown[] });
    }
  };
  walk(layer.container);
  return labels;
}

describe('TowerLayer memory-cell label', () => {
  it('prints what the cell has learned, as the bonus it adds to every hit', () => {
    const state = boardState();
    const layer = new TowerLayer(state.caseId);
    const learned = DEFENDERS.mem.learn * 3;
    state.towers = [memoryCell(learned)];

    layer.draw(state);

    expect(visibleLabels(layer)).toEqual([`+${String(Math.round(learned))}`]);
    layer.destroy();
  });

  it('says nothing until the cell has learned something', () => {
    const state = boardState();
    const layer = new TowerLayer(state.caseId);
    state.towers = [memoryCell(0)];

    layer.draw(state);

    expect(visibleLabels(layer)).toEqual([]);
    layer.destroy();
  });

  it('updates the bonus as the cell learns', () => {
    const state = boardState();
    const layer = new TowerLayer(state.caseId);
    const cell = memoryCell(DEFENDERS.mem.learn);
    state.towers = [cell];

    layer.draw(state);
    expect(visibleLabels(layer)).toEqual([`+${String(Math.round(DEFENDERS.mem.learn))}`]);

    cell.xp = DEFENDERS.mem.cap;
    layer.draw(state);
    expect(visibleLabels(layer)).toEqual([`+${String(Math.round(DEFENDERS.mem.cap))}`]);
    layer.destroy();
  });

  it('is the only cell on the board that carries a number', () => {
    const state = boardState();
    const layer = new TowerLayer(state.caseId);
    state.towers = [memoryCell(DEFENDERS.mem.cap), phagocyte()];

    layer.draw(state);

    expect(visibleLabels(layer)).toEqual([`+${String(Math.round(DEFENDERS.mem.cap))}`]);
    layer.destroy();
  });

  it('takes the label away with the cell it belonged to', () => {
    const state = boardState();
    const layer = new TowerLayer(state.caseId);
    state.towers = [memoryCell(DEFENDERS.mem.cap)];

    layer.draw(state);
    expect(visibleLabels(layer)).toHaveLength(1);

    state.towers = [];
    layer.draw(state);
    expect(visibleLabels(layer)).toEqual([]);
    layer.destroy();
  });
});

const CELL_X = 206;
const CELL_Y = 88;

function phagocyteGrown(matured: boolean): Tower {
  return {
    kind: 'phago', spotIndex: 1, x: CELL_X, y: CELL_Y, hp: TOWER_MAX_HP, stun: 0, matured,
    holdingEnemyId: null, digested: 0, rest: 0,
  };
}

/**
 * The body drawn for the cell standing at this position. Cell bodies are the only graphics the
 * layer moves off the origin, so a position lookup finds one without reaching into the pool.
 */
function bodyAt(layer: TowerLayer, x: number, y: number): Graphics {
  const found: Graphics[] = [];
  const walk = (node: Container): void => {
    for (const child of node.children) {
      if (child instanceof Graphics) {
        if (child.visible && child.position.x === x && child.position.y === y) found.push(child);
        continue;
      }
      walk(child);
    }
  };
  walk(layer.container);

  const [body] = found;
  if (body === undefined) throw new Error(`No cell body drawn at ${String(x)}, ${String(y)}`);
  return body;
}

function maturedRange(): number {
  const stats: Record<string, unknown> = { ...(maturedFormOf('phago')?.stats ?? {}) };
  const range = stats.range;
  if (typeof range !== 'number') {
    throw new Error('The macrophage no longer moves its range; this test needs rewriting');
  }
  return range;
}

describe('TowerLayer matured cells', () => {
  it('draws a grown cell with a mark the cell it grew from does not have', () => {
    const plainLayer = new TowerLayer('forearm');
    const plain = boardState();
    plain.towers = [phagocyteGrown(false)];
    plainLayer.draw(plain);

    const grownLayer = new TowerLayer('forearm');
    const grown = boardState();
    grown.towers = [phagocyteGrown(true)];
    grownLayer.draw(grown);

    expect(bodyAt(grownLayer, CELL_X, CELL_Y).context.instructions.length)
      .toBeGreaterThan(bodyAt(plainLayer, CELL_X, CELL_Y).context.instructions.length);

    plainLayer.destroy();
    grownLayer.destroy();
  });

  it('repaints the cell that matures, rather than keeping the drawing it had', () => {
    const layer = new TowerLayer('forearm');
    const state = boardState();
    const cell = phagocyteGrown(false);
    state.towers = [cell];

    layer.draw(state);
    const before = bodyAt(layer, CELL_X, CELL_Y).context.instructions.length;

    cell.matured = true;
    layer.draw(state);

    expect(bodyAt(layer, CELL_X, CELL_Y).context.instructions.length).not.toBe(before);
    layer.destroy();
  });

  it('shows the reach the grown cell actually fights with', () => {
    const plainLayer = new TowerLayer('forearm');
    const plain = boardState();
    plain.towers = [phagocyteGrown(false)];
    plainLayer.draw(plain);

    const grownLayer = new TowerLayer('forearm');
    const grown = boardState();
    grown.towers = [phagocyteGrown(true)];
    grownLayer.draw(grown);

    expect(bodyAt(plainLayer, CELL_X, CELL_Y).getLocalBounds().width)
      .toBeCloseTo(DEFENDERS.phago.range * 2, 6);
    expect(bodyAt(grownLayer, CELL_X, CELL_Y).getLocalBounds().width)
      .toBeCloseTo(maturedRange() * 2, 6);

    plainLayer.destroy();
    grownLayer.destroy();
  });
});

function mastCell(flash: number): MastTower {
  return {
    kind: 'mast', spotIndex: 1, x: CELL_X, y: CELL_Y, hp: TOWER_MAX_HP, stun: 0, matured: false,
    cooldown: 0, flash,
  };
}

/**
 * What the cell is currently drawn from. A repaint builds new instructions, so holding the
 * first one and comparing identity says whether the drawing was rebuilt — which is the thing
 * an expanding pulse depends on and a cached signature is exactly what would prevent.
 */
function drawing(layer: TowerLayer): unknown {
  const [first] = bodyAt(layer, CELL_X, CELL_Y).context.instructions;
  if (first === undefined) throw new Error('The cell was never drawn');
  return first;
}

/** Outlines in the cell's drawing. The pulse is one; a filled disc behind it is not. */
function strokeCount(layer: TowerLayer): number {
  return bodyAt(layer, CELL_X, CELL_Y).context.instructions
    .filter((instruction) => instruction.action === 'stroke').length;
}

/** A mast cell drawn on its own layer, so two of them can be compared side by side. */
function mastLayer(flash: number, motion?: Motion): TowerLayer {
  const layer = new TowerLayer('forearm');
  const state = boardState();
  state.towers = [mastCell(flash)];
  layer.draw(state, motion);
  return layer;
}

describe('TowerLayer burst pulse', () => {
  it('throws a front the resting cell does not have', () => {
    const resting = mastLayer(0);
    const bursting = mastLayer(BURST_SECONDS);

    expect(strokeCount(bursting)).toBe(strokeCount(resting) + 1);
    expect(bodyAt(bursting, CELL_X, CELL_Y).context.instructions.length)
      .toBeGreaterThan(bodyAt(resting, CELL_X, CELL_Y).context.instructions.length);

    resting.destroy();
    bursting.destroy();
  });

  /** Reduced motion keeps the lit disc and drops the front, which is what it looked like before. */
  it('lights the disc but throws nothing when motion is reduced', () => {
    const resting = mastLayer(0, 'reduced');
    const bursting = mastLayer(BURST_SECONDS, 'reduced');

    expect(strokeCount(bursting)).toBe(strokeCount(resting));
    expect(bodyAt(bursting, CELL_X, CELL_Y).context.instructions.length)
      .toBeGreaterThan(bodyAt(resting, CELL_X, CELL_Y).context.instructions.length);

    resting.destroy();
    bursting.destroy();
  });

  /** The pulse expands, so it has to be repainted as the flash burns down. */
  it('redraws the cell as the pulse travels', () => {
    const layer = new TowerLayer('forearm');
    const state = boardState();
    const cell = mastCell(BURST_SECONDS);
    state.towers = [cell];

    layer.draw(state);
    const opening = drawing(layer);

    cell.flash = BURST_SECONDS / 2;
    layer.draw(state);

    expect(drawing(layer)).not.toBe(opening);
    layer.destroy();
  });

  /**
   * Under reduced motion a burst is one state rather than a sequence: the disc lights and
   * nothing travels, so the drawing must not be rebuilt frame after frame either.
   */
  it('holds one drawing for the whole burst when motion is reduced', () => {
    const layer = new TowerLayer('forearm');
    const state = boardState();
    const cell = mastCell(BURST_SECONDS);
    state.towers = [cell];

    layer.draw(state, 'reduced');
    const opening = drawing(layer);

    cell.flash = BURST_SECONDS / 2;
    layer.draw(state, 'reduced');

    expect(drawing(layer)).toBe(opening);
    layer.destroy();
  });

  /**
   * The pulse leaves the cell, so at the moment it lands it is still inside the disc — a ring
   * that starts at the edge of the range has nowhere to travel and reads as the range blinking.
   */
  it('starts the front at the cell rather than at the edge of its reach', () => {
    const opening = mastLayer(BURST_SECONDS);
    const closing = mastLayer(0.0001);
    const range = DEFENDERS.mast.range;

    expect(bodyAt(opening, CELL_X, CELL_Y).getLocalBounds().width).toBeCloseTo(range * 2, 6);
    expect(bodyAt(closing, CELL_X, CELL_Y).getLocalBounds().width).toBeGreaterThan(range * 2);

    opening.destroy();
    closing.destroy();
  });

  /** The last frame of a burst is the one before it ends, so that is where the drawing must go. */
  it('takes the burst off the cell when the flash runs out', () => {
    const layer = new TowerLayer('forearm');
    const state = boardState();
    const cell = mastCell(BURST_SECONDS / 1000);
    state.towers = [cell];

    layer.draw(state);
    const bursting = bodyAt(layer, CELL_X, CELL_Y).context.instructions.length;

    cell.flash = 0;
    layer.draw(state);

    expect(bodyAt(layer, CELL_X, CELL_Y).context.instructions.length).toBeLessThan(bursting);
    layer.destroy();
  });
});

/**
 * A tuning session is a loop: move a number, watch the board. A range the board does not redraw
 * breaks the loop silently — the ring keeps its old radius until something unrelated about the
 * cell changes, and the balancer trusts a picture that is out of date.
 */
describe('TowerLayer redraws a tuned range', () => {
  afterEach(() => { resetTuning(); });

  it('redraws a plain cell when its range moves under it', () => {
    const layer = new TowerLayer('forearm');
    const state = boardState();
    state.towers = [phagocyteGrown(false)];

    layer.draw(state);
    expect(bodyAt(layer, CELL_X, CELL_Y).getLocalBounds().width)
      .toBeCloseTo(DEFENDERS.phago.range * 2, 6);

    applyDefenderTuning('phago', { range: DEFENDERS.phago.range + 40 });
    layer.draw(state);

    expect(bodyAt(layer, CELL_X, CELL_Y).getLocalBounds().width)
      .toBeCloseTo(DEFENDERS.phago.range * 2, 6);
    layer.destroy();
  });

  it('redraws a grown cell when its matured range moves under it', () => {
    const layer = new TowerLayer('forearm');
    const state = boardState();
    state.towers = [phagocyteGrown(true)];

    layer.draw(state);
    expect(bodyAt(layer, CELL_X, CELL_Y).getLocalBounds().width).toBeCloseTo(maturedRange() * 2, 6);

    applyMaturationTuning('phago', { range: maturedRange() + 40 });
    layer.draw(state);

    expect(bodyAt(layer, CELL_X, CELL_Y).getLocalBounds().width).toBeCloseTo(maturedRange() * 2, 6);
    layer.destroy();
  });
});
