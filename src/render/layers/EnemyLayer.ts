import { Container, Graphics } from 'pixi.js';
import { PATHOGENS, type PathogenStats } from '@game/content/pathogens';
import type { Enemy, SimState } from '@game/types';
import {
  ENEMY_CORE, ENEMY_HEALTH_FILL, ENEMY_HEALTH_TRACK, defenderHex, pathogenHex,
} from '../colors';
import { assertNever } from '../exhaustive';
import { enemyRadius, healthBarWidth, quantise, squareToDiamondHalf } from '../geometry';
import { ViewPool } from '../pool';
import { bar, dashedRing, diamond, filledCircle, ring, roundedSquare } from '../shapes';

/** Prototype line 906: a 22-wide bar 9 above the body, and a core at 35% of the radius. */
const HEALTH_TRACK_WIDTH = 22;
const HEALTH_BAR_HEIGHT = 4;
const HEALTH_BAR_GAP = 9;
const CORE_FRACTION = 0.35;

const TAG_RING_OFFSET = 6;
const NO_TAG_RING_OFFSET = 5;
const REGEN_HALO_OFFSET = 4;

/** A repaint is worth doing once per drawn pixel of the health bar, and no sooner. */
const HEALTH_STEPS = HEALTH_TRACK_WIDTH;

class EnemyView {
  readonly graphics = new Graphics();
  /**
   * Packed appearance. NaN means "never painted" — it compares unequal to every signature
   * whatever the packing does next, so a recycled view always repaints for its new enemy.
   */
  signature = Number.NaN;
}

/**
 * Everything that changes the drawing rather than the position, packed into one number so
 * comparing frames costs no allocation. Position is not in here: an enemy that only moves
 * is repositioned, never repainted.
 */
function signatureOf(enemy: Enemy, stats: PathogenStats): number {
  const health = quantise(enemy.hp / enemy.maxHp, HEALTH_STEPS);
  const tagged = enemy.tag > 0 ? 1 : 0;
  const halo = hasRegenHalo(enemy, stats) ? 1 : 0;
  return (health * 2 + tagged) * 2 + halo;
}

/** A spore at full health and untagged is about to heal past anything you do to it. */
function hasRegenHalo(enemy: Enemy, stats: PathogenStats): boolean {
  return stats.regen !== undefined && enemy.hp >= enemy.maxHp && enemy.tag <= 0;
}

function paintBody(g: Graphics, radius: number, stats: PathogenStats, color: number): void {
  switch (stats.shape) {
    case 'circle':
      filledCircle(g, 0, 0, radius, color);
      return;
    case 'square':
      roundedSquare(g, 0, 0, radius, 3, color);
      return;
    case 'diamond':
      diamond(g, 0, 0, squareToDiamondHalf(radius), color);
      return;
    default:
      assertNever(stats.shape);
  }
}

function paint(g: Graphics, enemy: Enemy): void {
  g.clear();
  const stats = PATHOGENS[enemy.kind];
  const radius = enemyRadius(stats.radius, enemy.generation);
  const color = pathogenHex(enemy.kind);

  if (enemy.tag > 0) {
    dashedRing(g, 0, 0, radius + TAG_RING_OFFSET, defenderHex('anti'), 3, 3, 4);
  }
  if (stats.noTag === true) {
    ring(g, 0, 0, radius + NO_TAG_RING_OFFSET, color, 2.5);
  }

  paintBody(g, radius, stats, color);
  filledCircle(g, 0, 0, radius * CORE_FRACTION, ENEMY_CORE);

  if (hasRegenHalo(enemy, stats)) {
    ring(g, 0, 0, radius + REGEN_HALO_OFFSET, color, 2, 0.5);
  }

  if (enemy.hp < enemy.maxHp) {
    const left = -HEALTH_TRACK_WIDTH / 2;
    const top = -radius - HEALTH_BAR_GAP;
    bar(g, left, top, HEALTH_TRACK_WIDTH, HEALTH_BAR_HEIGHT, 2, ENEMY_HEALTH_TRACK, 0.8);
    bar(
      g, left, top, healthBarWidth(HEALTH_TRACK_WIDTH, enemy.hp, enemy.maxHp),
      HEALTH_BAR_HEIGHT, 2, ENEMY_HEALTH_FILL,
    );
  }
}

/**
 * Kills are instant, so there is nowhere in here for a death animation to live: the frame
 * an enemy leaves sim state its view is detached, and the next enemy to spawn gets it back.
 */
export class EnemyLayer {
  readonly container = new Container();
  readonly #pool: ViewPool<EnemyView>;

  constructor() {
    this.#pool = new ViewPool<EnemyView>({
      create: () => {
        const view = new EnemyView();
        view.graphics.visible = false;
        this.container.addChild(view.graphics);
        return view;
      },
      attach: (view) => { view.graphics.visible = true; },
      detach: (view) => {
        view.graphics.visible = false;
        view.signature = Number.NaN;
      },
      destroy: (view) => { view.graphics.destroy(); },
    });
  }

  draw(state: SimState): void {
    this.#pool.beginFrame();

    for (const enemy of state.enemies) {
      const view = this.#pool.acquire(enemy.id);
      const signature = signatureOf(enemy, PATHOGENS[enemy.kind]);
      if (signature !== view.signature) {
        paint(view.graphics, enemy);
        view.signature = signature;
      }
      view.graphics.position.set(enemy.x, enemy.y);
    }

    this.#pool.endFrame();
  }

  destroy(): void {
    this.#pool.destroyAll();
    this.container.destroy({ children: true });
  }
}
