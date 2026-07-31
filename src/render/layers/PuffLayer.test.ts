import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { PATHOGENS } from '@game/content/pathogens';
import { hashState } from '@game/hash';
import { createSimState } from '@game/state';
import type { Enemy, PathogenKind, SimState } from '@game/types';
import { PUFF_SECONDS } from '../effects';
import { PuffLayer } from './PuffLayer';

function boardState(): SimState {
  return createSimState({
    caseId: 'forearm',
    immunity: { staph: 0, film: 0, virus: 0 },
    clearedCount: 0,
    day: 1,
    totalKills: 0,
  });
}

let nextId = 1;

function enemy(x: number, y: number, distance: number, kind: PathogenKind = 'staph'): Enemy {
  const stats = PATHOGENS[kind];
  nextId += 1;
  return {
    id: nextId, kind, distance, x, y, hp: stats.hp, maxHp: stats.hp, tag: 0, generation: 0,
  };
}

/** Every puff the layer is currently showing. Nothing else lives in its container. */
function puffs(layer: PuffLayer): Graphics[] {
  const found: Graphics[] = [];
  for (const child of layer.container.children) {
    if (child instanceof Graphics && child.visible) found.push(child);
  }
  return found;
}

function onlyPuff(layer: PuffLayer): Graphics {
  const [puff, ...rest] = puffs(layer);
  if (puff === undefined) throw new Error('The layer drew no puff');
  if (rest.length > 0) throw new Error(`The layer drew ${String(rest.length + 1)} puffs`);
  return puff;
}

/** One frame at a plausible rate. Long enough to be visible, short enough to age slowly. */
const FRAME = 1 / 60;

describe('PuffLayer', () => {
  it('puffs where a pathogen fell', () => {
    const state = boardState();
    const layer = new PuffLayer();
    state.enemies = [enemy(120, 80, 200)];

    layer.draw(state, FRAME, 'full');

    state.enemies = [];
    state.waveKills += 1;
    layer.draw(state, FRAME, 'full');

    const puff = onlyPuff(layer);
    expect(puff.position.x).toBe(120);
    expect(puff.position.y).toBe(80);
    layer.destroy();
  });

  it('says nothing about a pathogen that got through', () => {
    const state = boardState();
    const layer = new PuffLayer();
    state.enemies = [enemy(300, 200, state.path.total)];

    layer.draw(state, FRAME, 'full');

    state.enemies = [];
    state.waveLeaks += 1;
    state.tissue -= 1;
    layer.draw(state, FRAME, 'full');

    expect(puffs(layer)).toHaveLength(0);
    layer.destroy();
  });

  /**
   * A leak and a kill on the same frame are indistinguishable by disappearance alone, so the
   * layer spends its one kill on the enemy nearest the start of the vessel — the other one is
   * the one that reached the end of it, because that is what reaching the end means.
   */
  it('puffs the kill and not the leak when both leave together', () => {
    const state = boardState();
    const layer = new PuffLayer();
    state.enemies = [enemy(60, 40, 30), enemy(300, 200, state.path.total)];

    layer.draw(state, FRAME, 'full');

    state.enemies = [];
    state.waveKills += 1;
    state.waveLeaks += 1;
    layer.draw(state, FRAME, 'full');

    expect(onlyPuff(layer).position.x).toBe(60);
    layer.destroy();
  });

  /** The budget is what was killed since the last frame, not what has been killed since. */
  it('does not save a kill up to spend on a leak later', () => {
    const state = boardState();
    const layer = new PuffLayer();
    state.enemies = [enemy(60, 40, 30)];
    layer.draw(state, FRAME, 'full');

    state.enemies = [];
    state.waveKills += 1;
    layer.draw(state, PUFF_SECONDS, 'full');
    expect(puffs(layer)).toHaveLength(0);

    state.enemies = [enemy(300, 200, state.path.total)];
    layer.draw(state, FRAME, 'full');

    state.enemies = [];
    state.waveLeaks += 1;
    layer.draw(state, FRAME, 'full');

    expect(puffs(layer)).toHaveLength(0);
    layer.destroy();
  });

  it('says nothing when the board is swept at the end of a wave', () => {
    const state = boardState();
    const layer = new PuffLayer();
    state.enemies = [enemy(60, 40, 30), enemy(90, 40, 60), enemy(120, 40, 90)];

    layer.draw(state, FRAME, 'full');

    state.enemies = [];
    layer.draw(state, FRAME, 'full');

    expect(puffs(layer)).toHaveLength(0);
    layer.destroy();
  });

  it('fades a puff out and takes it away', () => {
    const state = boardState();
    const layer = new PuffLayer();
    state.enemies = [enemy(120, 80, 200)];
    layer.draw(state, FRAME, 'full');

    state.enemies = [];
    state.waveKills += 1;
    layer.draw(state, FRAME, 'full');

    const puff = onlyPuff(layer);
    const openingAlpha = puff.alpha;
    const openingScale = puff.scale.x;

    layer.draw(state, PUFF_SECONDS / 2, 'full');
    expect(onlyPuff(layer).alpha).toBeLessThan(openingAlpha);
    expect(onlyPuff(layer).scale.x).toBeGreaterThan(openingScale);

    layer.draw(state, PUFF_SECONDS, 'full');
    expect(puffs(layer)).toHaveLength(0);
    layer.destroy();
  });

  it('draws nothing at all when the player has asked for less motion', () => {
    const state = boardState();
    const layer = new PuffLayer();
    state.enemies = [enemy(120, 80, 200)];
    layer.draw(state, FRAME, 'reduced');

    state.enemies = [];
    state.waveKills += 1;
    layer.draw(state, FRAME, 'reduced');

    expect(puffs(layer)).toHaveLength(0);
    layer.destroy();
  });

  /**
   * A wave kills dozens. The pool has to settle at the number of puffs alive at once, which is
   * a handful, rather than growing with the body count.
   */
  it('reuses its graphics rather than building one per kill', () => {
    const state = boardState();
    const layer = new PuffLayer();

    for (let wave = 0; wave < 30; wave += 1) {
      state.enemies = [enemy(60, 40, 30)];
      layer.draw(state, FRAME, 'full');
      state.enemies = [];
      state.waveKills += 1;
      layer.draw(state, PUFF_SECONDS, 'full');
    }

    expect(layer.container.children.length).toBeLessThanOrEqual(2);
    layer.destroy();
  });

  /**
   * A restarted case is a new state with its own enemies and its own kill count, running under
   * the same renderer. Nothing may carry over: not the board that vanished with the old state,
   * and not a tally that would otherwise swallow the new run's first kills.
   */
  it('starts a restarted case with a clean board and a working budget', () => {
    const state = boardState();
    const layer = new PuffLayer();
    state.enemies = [enemy(60, 40, 30), enemy(90, 40, 60), enemy(120, 40, 90)];
    state.waveKills = 7;
    layer.draw(state, FRAME, 'full');

    const restarted = boardState();
    layer.draw(restarted, FRAME, 'full');
    expect(puffs(layer)).toHaveLength(0);

    restarted.enemies = [enemy(150, 90, 120)];
    layer.draw(restarted, FRAME, 'full');

    restarted.enemies = [];
    restarted.waveKills += 1;
    layer.draw(restarted, FRAME, 'full');

    expect(onlyPuff(layer).position.x).toBe(150);
    layer.destroy();
  });

  it('takes the last run\'s puffs off the board with the run', () => {
    const state = boardState();
    const layer = new PuffLayer();
    state.enemies = [enemy(60, 40, 30)];
    layer.draw(state, FRAME, 'full');

    state.enemies = [];
    state.waveKills += 1;
    layer.draw(state, FRAME, 'full');
    expect(puffs(layer)).toHaveLength(1);

    layer.draw(boardState(), FRAME, 'full');

    expect(puffs(layer)).toHaveLength(0);
    layer.destroy();
  });

  /** Two runs' kill counts are not comparable, so a swap may never be read as a body count. */
  it('never mistakes another run\'s tally for kills of its own', () => {
    const state = boardState();
    const layer = new PuffLayer();
    state.enemies = [enemy(60, 40, 30), enemy(90, 40, 60), enemy(120, 40, 90)];
    layer.draw(state, FRAME, 'full');

    const other = boardState();
    other.waveKills = 40;
    layer.draw(other, FRAME, 'full');

    expect(puffs(layer)).toHaveLength(0);
    layer.destroy();
  });

  /**
   * The constraint the whole effect lives under. The simulation removed the enemy exactly as
   * it always did; drawing its puff may not put a single thing back.
   */
  it('changes nothing about the simulation it is handed', () => {
    const state = boardState();
    const layer = new PuffLayer();
    state.enemies = [enemy(120, 80, 200)];
    layer.draw(state, FRAME, 'full');

    state.enemies = [];
    state.waveKills += 1;
    const before = hashState(state);

    layer.draw(state, FRAME, 'full');
    layer.draw(state, FRAME, 'full');

    expect(hashState(state)).toBe(before);
    expect(state.enemies).toHaveLength(0);
    layer.destroy();
  });
});
