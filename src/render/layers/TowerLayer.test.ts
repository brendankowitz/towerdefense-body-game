import { afterEach, describe, expect, it } from 'vitest';
import { Container, Graphics, Text } from 'pixi.js';
import { DEFENDERS } from '@game/content/defenders';
import { maturedFormOf } from '@game/content/maturation';
import { TOWER_MAX_HP } from '@game/content/rules';
import { applyDefenderTuning, applyMaturationTuning, resetTuning } from '@game/content/tuning';
import { createSimState } from '@game/state';
import { addEnemy, addTower } from '@game/testing';
import type {
  MastTower, MemoryTower, PathogenKind, PhagocyteTower, SimState, Tower,
} from '@game/types';
import { defenderHex, pathogenHex } from '../colors';
import {
  BURST_SECONDS, LOAD_MAX_RADIUS, LOAD_MIN_RADIUS, MOTE_COUNT, MOTE_SECONDS,
} from '../effects';
import type { Motion } from '../motion';
import { TowerLayer } from './TowerLayer';

/** A frame that advances nothing. Most of these assertions are about a still picture. */
const STILL = 0;

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

    layer.draw(state, STILL, 'full');

    expect(visibleLabels(layer)).toEqual([`+${String(Math.round(learned))}`]);
    layer.destroy();
  });

  it('says nothing until the cell has learned something', () => {
    const state = boardState();
    const layer = new TowerLayer(state.caseId);
    state.towers = [memoryCell(0)];

    layer.draw(state, STILL, 'full');

    expect(visibleLabels(layer)).toEqual([]);
    layer.destroy();
  });

  it('updates the bonus as the cell learns', () => {
    const state = boardState();
    const layer = new TowerLayer(state.caseId);
    const cell = memoryCell(DEFENDERS.mem.learn);
    state.towers = [cell];

    layer.draw(state, STILL, 'full');
    expect(visibleLabels(layer)).toEqual([`+${String(Math.round(DEFENDERS.mem.learn))}`]);

    cell.xp = DEFENDERS.mem.cap;
    layer.draw(state, STILL, 'full');
    expect(visibleLabels(layer)).toEqual([`+${String(Math.round(DEFENDERS.mem.cap))}`]);
    layer.destroy();
  });

  it('is the only cell on the board that carries a number', () => {
    const state = boardState();
    const layer = new TowerLayer(state.caseId);
    state.towers = [memoryCell(DEFENDERS.mem.cap), phagocyte()];

    layer.draw(state, STILL, 'full');

    expect(visibleLabels(layer)).toEqual([`+${String(Math.round(DEFENDERS.mem.cap))}`]);
    layer.destroy();
  });

  it('takes the label away with the cell it belonged to', () => {
    const state = boardState();
    const layer = new TowerLayer(state.caseId);
    state.towers = [memoryCell(DEFENDERS.mem.cap)];

    layer.draw(state, STILL, 'full');
    expect(visibleLabels(layer)).toHaveLength(1);

    state.towers = [];
    layer.draw(state, STILL, 'full');
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
    plainLayer.draw(plain, STILL, 'full');

    const grownLayer = new TowerLayer('forearm');
    const grown = boardState();
    grown.towers = [phagocyteGrown(true)];
    grownLayer.draw(grown, STILL, 'full');

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

    layer.draw(state, STILL, 'full');
    const before = bodyAt(layer, CELL_X, CELL_Y).context.instructions.length;

    cell.matured = true;
    layer.draw(state, STILL, 'full');

    expect(bodyAt(layer, CELL_X, CELL_Y).context.instructions.length).not.toBe(before);
    layer.destroy();
  });

  it('shows the reach the grown cell actually fights with', () => {
    const plainLayer = new TowerLayer('forearm');
    const plain = boardState();
    plain.towers = [phagocyteGrown(false)];
    plainLayer.draw(plain, STILL, 'full');

    const grownLayer = new TowerLayer('forearm');
    const grown = boardState();
    grown.towers = [phagocyteGrown(true)];
    grownLayer.draw(grown, STILL, 'full');

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
function mastLayer(flash: number, motion: Motion = 'full'): TowerLayer {
  const layer = new TowerLayer('forearm');
  const state = boardState();
  state.towers = [mastCell(flash)];
  layer.draw(state, STILL, motion);
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

    layer.draw(state, STILL, 'full');
    const opening = drawing(layer);

    cell.flash = BURST_SECONDS / 2;
    layer.draw(state, STILL, 'full');

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

    layer.draw(state, STILL, 'reduced');
    const opening = drawing(layer);

    cell.flash = BURST_SECONDS / 2;
    layer.draw(state, STILL, 'reduced');

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

    layer.draw(state, STILL, 'full');
    const bursting = bodyAt(layer, CELL_X, CELL_Y).context.instructions.length;

    cell.flash = 0;
    layer.draw(state, STILL, 'full');

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

    layer.draw(state, STILL, 'full');
    expect(bodyAt(layer, CELL_X, CELL_Y).getLocalBounds().width)
      .toBeCloseTo(DEFENDERS.phago.range * 2, 6);

    applyDefenderTuning('phago', { range: DEFENDERS.phago.range + 40 });
    layer.draw(state, STILL, 'full');

    expect(bodyAt(layer, CELL_X, CELL_Y).getLocalBounds().width)
      .toBeCloseTo(DEFENDERS.phago.range * 2, 6);
    layer.destroy();
  });

  it('redraws a grown cell when its matured range moves under it', () => {
    const layer = new TowerLayer('forearm');
    const state = boardState();
    state.towers = [phagocyteGrown(true)];

    layer.draw(state, STILL, 'full');
    expect(bodyAt(layer, CELL_X, CELL_Y).getLocalBounds().width).toBeCloseTo(maturedRange() * 2, 6);

    applyMaturationTuning('phago', { range: maturedRange() + 40 });
    layer.draw(state, STILL, 'full');

    expect(bodyAt(layer, CELL_X, CELL_Y).getLocalBounds().width).toBeCloseTo(maturedRange() * 2, 6);
    layer.destroy();
  });
});

/**
 * The cell body is 20 across. Restated here rather than exported: this suite needs it to say
 * where a mote may and may not be drawn, and a renderer constant that only a test reads is a
 * constant that has stopped describing the drawing.
 */
const CELL_BODY_RADIUS = 20;

/** Straight below the cell, far enough out that there is a tether to cross. */
const PREY_X = CELL_X;
const PREY_Y = CELL_Y + 60;

interface Feeding {
  readonly layer: TowerLayer;
  readonly state: SimState;
  readonly cell: PhagocyteTower;
}

/** A phagocyte holding a body, ready to draw. Nothing has been drawn yet. */
function feeding(kind: PathogenKind = 'staph', digested = 0): Feeding {
  const state = boardState();
  const layer = new TowerLayer(state.caseId);
  const cell = addTower(state, 'phago', 1, CELL_X, CELL_Y);
  cell.digested = digested;
  const prey = addEnemy(state, kind, { x: PREY_X, y: PREY_Y });
  cell.holdingEnemyId = prey.id;
  return { layer, state, cell };
}

/**
 * The matter currently crossing a tether.
 *
 * The layer draws it into its own container, the one between the tether line and the cell
 * bodies, so it is found by where it sits in the draw order rather than by guessing which
 * graphics is which from its contents.
 */
function crossing(layer: TowerLayer): Graphics[] {
  const container = layer.container.children[2];
  if (container === undefined || container instanceof Graphics) {
    throw new Error('The layer no longer draws its motes into their own container');
  }
  return container.children.filter(
    (child): child is Graphics => child instanceof Graphics && child.visible,
  );
}

/** The tether line, which is the layer's second child and is drawn under everything crossing it. */
function tether(layer: TowerLayer): Graphics {
  const line = layer.container.children[1];
  if (!(line instanceof Graphics)) throw new Error('The layer no longer draws its tethers second');
  return line;
}

/** How far a drawn thing is from the cell that is eating. */
function distanceToCell(g: Graphics): number {
  return Math.hypot(g.position.x - CELL_X, g.position.y - CELL_Y);
}

/** Radii of the filled circles a drawing is built from, in the order they were laid down. */
function filledRadii(g: Graphics): number[] {
  const radii: number[] = [];
  for (const instruction of g.context.instructions) {
    if (instruction.action !== 'fill') continue;
    for (const step of instruction.data.path.instructions) {
      if (step.action !== 'circle') continue;
      const radius: unknown = step.data[2];
      if (typeof radius === 'number') radii.push(radius);
    }
  }
  return radii;
}

/** The colour a drawing's first fill was laid down in. */
function firstFillColor(g: Graphics): number {
  const [instruction] = g.context.instructions;
  if (instruction === undefined || instruction.action !== 'fill') {
    throw new Error('The drawing opens with something other than a fill');
  }
  return instruction.data.style.color;
}

/**
 * The mark inside the cell body. It is the last circle the cell is filled from — the range disc
 * and the body itself are laid down before it, and the health bar after it is not a circle.
 */
function loadMark(layer: TowerLayer): number {
  const radii = filledRadii(bodyAt(layer, CELL_X, CELL_Y));
  const last = radii.at(-1);
  if (last === undefined) throw new Error('The cell was drawn from no circles at all');
  return last;
}

describe('TowerLayer absorption', () => {
  it('draws matter crossing the tether while a cell is taking a body in', () => {
    const { layer, state } = feeding();

    layer.draw(state, MOTE_SECONDS / 4, 'full');

    expect(crossing(layer)).toHaveLength(MOTE_COUNT);
    layer.destroy();
  });

  it('draws nothing crossing a cell that is holding nothing', () => {
    const state = boardState();
    const layer = new TowerLayer(state.caseId);
    addTower(state, 'phago', 1, CELL_X, CELL_Y);

    layer.draw(state, MOTE_SECONDS / 4, 'full');

    expect(crossing(layer)).toHaveLength(0);
    expect(tether(layer).context.instructions).toHaveLength(0);
    layer.destroy();
  });

  it('takes the matter away with the body when the cell lets go', () => {
    const { layer, state, cell } = feeding();
    layer.draw(state, MOTE_SECONDS / 4, 'full');
    expect(crossing(layer)).toHaveLength(MOTE_COUNT);

    cell.holdingEnemyId = null;
    layer.draw(state, MOTE_SECONDS / 4, 'full');

    expect(crossing(layer)).toHaveLength(0);
    layer.destroy();
  });

  /** The matter is the pathogen's, moved. Drawn in the cell's own colour it would be decoration. */
  it('carries the matter in the colour of the body it came off', () => {
    const { layer, state } = feeding('virus');

    layer.draw(state, MOTE_SECONDS / 4, 'full');

    const [mote] = crossing(layer);
    if (mote === undefined) throw new Error('Nothing was drawn crossing the tether');
    expect(firstFillColor(mote)).toBe(pathogenHex('virus'));
    expect(firstFillColor(mote)).not.toBe(defenderHex('phago'));
    layer.destroy();
  });

  /**
   * Two bodies of different kinds are different matter. The motes are pooled, so the second body
   * is drawn by the same graphics as the first and they have to be repainted for it — this is
   * the one place in the layer where a cached drawing can go stale against the board.
   */
  it('repaints the matter when the same cell starts on a body of another kind', () => {
    const { layer, state, cell } = feeding('staph');
    layer.draw(state, MOTE_SECONDS / 4, 'full');
    const staph = crossing(layer).map(firstFillColor);
    expect(staph).toEqual(Array.from({ length: MOTE_COUNT }, () => pathogenHex('staph')));

    state.enemies = [];
    const next = addEnemy(state, 'virus', { x: PREY_X, y: PREY_Y });
    cell.holdingEnemyId = next.id;
    layer.draw(state, MOTE_SECONDS / 4, 'full');

    expect(crossing(layer).map(firstFillColor))
      .toEqual(Array.from({ length: MOTE_COUNT }, () => pathogenHex('virus')));
    layer.destroy();
  });

  /**
   * A train, not a single lump drawn three times. Motes stacked on one phase are one mote as far
   * as a player is concerned, and a lone blob shuttling back and forth reads as a ferry rather
   * than as a body being taken apart.
   */
  it('strings the matter out along the tether rather than stacking it', () => {
    const { layer, state } = feeding();

    layer.draw(state, MOTE_SECONDS / 4, 'full');

    const spread = crossing(layer).map(distanceToCell);
    expect(new Set(spread).size).toBe(MOTE_COUNT);
    for (const [index, distance] of spread.entries()) {
      for (const other of spread.slice(index + 1)) {
        expect(Math.abs(distance - other)).toBeGreaterThan(1);
      }
    }
    layer.destroy();
  });

  it('moves every piece of matter towards the cell as time passes', () => {
    const { layer, state } = feeding();
    const step = MOTE_SECONDS / 10;

    layer.draw(state, step, 'full');
    const opening = crossing(layer).map(distanceToCell);

    layer.draw(state, step, 'full');
    const later = crossing(layer).map(distanceToCell);

    expect(later).toHaveLength(MOTE_COUNT);
    later.forEach((distance, index) => {
      expect(distance).toBeLessThan(opening[index] ?? Number.NaN);
    });
    layer.destroy();
  });

  /** It travels inward and stops at the wall: matter drawn over the cell is not absorbed matter. */
  it('keeps the matter between the body and the wall of the cell', () => {
    const { layer, state } = feeding();
    const gap = Math.hypot(PREY_X - CELL_X, PREY_Y - CELL_Y);

    for (let frame = 0; frame < 12; frame += 1) {
      layer.draw(state, MOTE_SECONDS / 8, 'full');
      for (const mote of crossing(layer)) {
        expect(distanceToCell(mote)).toBeGreaterThanOrEqual(CELL_BODY_RADIUS);
        expect(distanceToCell(mote)).toBeLessThanOrEqual(gap);
      }
    }
    layer.destroy();
  });

  it('draws nothing crossing when the body is already at the wall', () => {
    const state = boardState();
    const layer = new TowerLayer(state.caseId);
    const cell = addTower(state, 'phago', 1, CELL_X, CELL_Y);
    const prey = addEnemy(state, 'staph', { x: CELL_X, y: CELL_Y + CELL_BODY_RADIUS / 2 });
    cell.holdingEnemyId = prey.id;

    layer.draw(state, MOTE_SECONDS / 4, 'full');

    expect(crossing(layer)).toHaveLength(0);
    expect(tether(layer).context.instructions.length).toBeGreaterThan(0);
    layer.destroy();
  });

  /**
   * Reduced motion keeps the tether and drops what crosses it. The tether says which body this
   * cell has taken, and nothing else on the board says it — so it may not disappear with the
   * animation the way a puff or a pulse does.
   */
  it('keeps the tether and stops the matter when motion is reduced', () => {
    const { layer, state } = feeding();

    layer.draw(state, MOTE_SECONDS / 4, 'reduced');

    expect(crossing(layer)).toHaveLength(0);
    expect(tether(layer).context.instructions.length).toBeGreaterThan(0);
    layer.destroy();
  });

  /** At most five cells eat at once, so the pool settles immediately and never grows again. */
  it('reuses the same matter frame after frame', () => {
    const { layer, state } = feeding();

    layer.draw(state, MOTE_SECONDS / 8, 'full');
    const opening = crossing(layer);

    for (let frame = 0; frame < 20; frame += 1) layer.draw(state, MOTE_SECONDS / 8, 'full');

    expect(crossing(layer)).toEqual(opening);
    layer.destroy();
  });
});

describe('TowerLayer phagocyte load', () => {
  const capacity = (): number => DEFENDERS.phago.capacity;

  it('draws an empty cell the smallest mark and a full one the largest', () => {
    const empty = feeding('staph', 0);
    empty.layer.draw(empty.state, STILL, 'full');

    const full = feeding('staph', capacity());
    full.layer.draw(full.state, STILL, 'full');

    expect(loadMark(empty.layer)).toBe(LOAD_MIN_RADIUS);
    expect(loadMark(full.layer)).toBe(LOAD_MAX_RADIUS);
    empty.layer.destroy();
    full.layer.destroy();
  });

  it('grows the mark with the matter the cell has broken down', () => {
    const { layer, state, cell } = feeding('staph', 0);
    layer.draw(state, STILL, 'full');
    const empty = loadMark(layer);

    cell.digested = capacity() / 2;
    layer.draw(state, STILL, 'full');
    const half = loadMark(layer);

    cell.digested = capacity();
    layer.draw(state, STILL, 'full');

    expect(half).toBeGreaterThan(empty);
    expect(loadMark(layer)).toBeGreaterThan(half);
    layer.destroy();
  });

  /**
   * A cell that reaches its appetite dumps the bank and takes the long rest, so the mark has to
   * empty with it — a full cell that stays full while it rests reads as a cell that is stuck.
   */
  it('empties the mark when the cell dumps its load and rests', () => {
    const { layer, state, cell } = feeding('staph', capacity());
    layer.draw(state, STILL, 'full');
    expect(loadMark(layer)).toBe(LOAD_MAX_RADIUS);

    cell.holdingEnemyId = null;
    cell.digested = 0;
    cell.rest = DEFENDERS.phago.rest;
    layer.draw(state, STILL, 'full');

    expect(loadMark(layer)).toBe(LOAD_MIN_RADIUS);
    layer.destroy();
  });

  it('does not rebuild the cell for a change of load too small to see', () => {
    const { layer, state, cell } = feeding('staph', 0);
    layer.draw(state, STILL, 'full');
    const opening = drawing(layer);

    cell.digested = capacity() / 40;
    layer.draw(state, STILL, 'full');

    expect(drawing(layer)).toBe(opening);
    layer.destroy();
  });

  /** But it does rebuild once the growth is worth a pixel, or a filling cell would never fill. */
  it('rebuilds the cell once the load has visibly grown', () => {
    const { layer, state, cell } = feeding('staph', 0);
    layer.draw(state, STILL, 'full');
    const opening = drawing(layer);

    cell.digested = capacity() / 2;
    layer.draw(state, STILL, 'full');

    expect(drawing(layer)).not.toBe(opening);
    layer.destroy();
  });
});
