import { describe, expect, it } from 'vitest';
import { Container, Graphics, Text } from 'pixi.js';
import { DEFENDERS } from '@game/content/defenders';
import { maturedFormOf } from '@game/content/maturation';
import { TOWER_MAX_HP } from '@game/content/rules';
import { createSimState } from '@game/state';
import type { MemoryTower, SimState, Tower } from '@game/types';
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
    holdingEnemyId: null, eaten: 0, rest: 0,
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
    holdingEnemyId: null, eaten: 0, rest: 0,
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
