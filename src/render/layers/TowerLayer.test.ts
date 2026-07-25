import { describe, expect, it } from 'vitest';
import { Text } from 'pixi.js';
import { DEFENDERS } from '@game/content/defenders';
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
  return { kind: 'mem', spotIndex, x: 70, y: 118, hp: TOWER_MAX_HP, stun: 0, cooldown: 0, xp };
}

function phagocyte(spotIndex = 1): Tower {
  return {
    kind: 'phago', spotIndex, x: 206, y: 88, hp: TOWER_MAX_HP, stun: 0,
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
