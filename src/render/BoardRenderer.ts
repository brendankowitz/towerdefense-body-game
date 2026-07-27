import { Application, Container } from 'pixi.js';
import { FAST_MULTIPLIER } from '@game/content/rules';
import { MAX_FRAME_SECONDS } from '@game/loop';
import type { CaseId, SimState } from '@game/types';
import { BeamLayer } from './layers/BeamLayer';
import { EnemyLayer } from './layers/EnemyLayer';
import { PathLayer } from './layers/PathLayer';
import { PuffLayer } from './layers/PuffLayer';
import { TowerLayer } from './layers/TowerLayer';
import { motionOf, reducedMotionQuery } from './motion';
import { IDENTITY_VIEWPORT, fitViewport, type Viewport } from './viewport';

/**
 * The board, drawn imperatively from sim state.
 *
 * It still has no clock. Nothing here advances on its own: every frame is a pure function of
 * the state it is handed plus the elapsed time the caller measured, and whoever owns the
 * animation frame decides when that happens. That is what makes "the simulation pauses when
 * the page is hidden" true of the picture as well as the rules — a hidden page simply stops
 * calling `draw`, and the effects freeze with everything else.
 */
export class BoardRenderer {
  readonly #app: Application;
  readonly #host: HTMLElement;
  readonly #world = new Container();
  readonly #path: PathLayer;
  readonly #towers: TowerLayer;
  readonly #beams = new BeamLayer();
  readonly #puffs = new PuffLayer();
  readonly #enemies = new EnemyLayer();
  readonly #reducedMotion = reducedMotionQuery();
  #viewport: Viewport = IDENTITY_VIEWPORT;

  private constructor(app: Application, host: HTMLElement, caseId: CaseId) {
    this.#app = app;
    this.#host = host;
    this.#path = new PathLayer(caseId);
    this.#towers = new TowerLayer(caseId);

    // Draw order, from the reference: vessel, then cells and the ranges they claim, then
    // what they fire, then what is coming. Threats are never hidden behind anything — which
    // is also why puffs go under the enemies rather than over them.
    this.#world.addChild(
      this.#path.container,
      this.#towers.container,
      this.#beams.container,
      this.#puffs.container,
      this.#enemies.container,
    );
    this.#app.stage.addChild(this.#world);
    this.resize();
  }

  static async create(host: HTMLElement, caseId: CaseId): Promise<BoardRenderer> {
    const app = new Application();
    await app.init({
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      // Pixi must not own a frame loop or listen for resizes. There is one animation frame
      // in this application and it drives the simulation; this class is called from it.
      autoStart: false,
      sharedTicker: false,
      resolution: globalThis.devicePixelRatio,
      width: host.clientWidth,
      height: host.clientHeight,
    });
    host.appendChild(app.canvas);
    return new BoardRenderer(app, host, caseId);
  }

  get canvas(): HTMLCanvasElement {
    return this.#app.canvas;
  }

  get viewport(): Viewport {
    return this.#viewport;
  }

  /** Re-fits the board to the host element. Cheap enough to call from a ResizeObserver. */
  resize(): void {
    const width = this.#host.clientWidth;
    const height = this.#host.clientHeight;
    if (width <= 0 || height <= 0) return;

    this.#app.renderer.resize(width, height);
    this.#viewport = fitViewport(width, height);
    this.#world.scale.set(this.#viewport.scale);
    this.#world.position.set(this.#viewport.offsetX, this.#viewport.offsetY);
  }

  /**
   * `elapsedSeconds` is the wall time the caller measured for this frame — the same number it
   * handed the simulation, before the simulation scaled it. It is clamped and scaled here the
   * way `GameLoop.advance` clamps and scales its own, so an effect ages on the clock the board
   * is actually running on: a stalled frame does not jump one, and 2× is over twice as fast.
   */
  draw(state: SimState, elapsedSeconds: number): void {
    const motion = motionOf(this.#reducedMotion);
    const effectSeconds =
      Math.min(elapsedSeconds, MAX_FRAME_SECONDS) * (state.fast ? FAST_MULTIPLIER : 1);

    this.#towers.draw(state, effectSeconds, motion);
    this.#beams.draw(state);
    this.#puffs.draw(state, effectSeconds, motion);
    this.#enemies.draw(state);
    this.#app.render();
  }

  destroy(): void {
    this.#path.destroy();
    this.#towers.destroy();
    this.#beams.destroy();
    this.#puffs.destroy();
    this.#enemies.destroy();
    this.#app.destroy(true, { children: true, texture: true });
  }
}
