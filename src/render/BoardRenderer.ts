import { Application, Container } from 'pixi.js';
import type { CaseId, SimState } from '@game/types';
import { BeamLayer } from './layers/BeamLayer';
import { EnemyLayer } from './layers/EnemyLayer';
import { PathLayer } from './layers/PathLayer';
import { TowerLayer } from './layers/TowerLayer';
import { IDENTITY_VIEWPORT, fitViewport, type Viewport } from './viewport';

/**
 * The board, drawn imperatively from sim state.
 *
 * It has no clock. Nothing here advances, fades or pulses on its own: every frame is a
 * pure function of the state it is handed, and whoever owns the animation frame decides
 * when that happens. That is what makes "the simulation pauses when the page is hidden"
 * true of the picture as well as the rules — a hidden page simply stops calling `draw`.
 */
export class BoardRenderer {
  readonly #app: Application;
  readonly #host: HTMLElement;
  readonly #world = new Container();
  readonly #path: PathLayer;
  readonly #towers: TowerLayer;
  readonly #beams = new BeamLayer();
  readonly #enemies = new EnemyLayer();
  #viewport: Viewport = IDENTITY_VIEWPORT;

  private constructor(app: Application, host: HTMLElement, caseId: CaseId) {
    this.#app = app;
    this.#host = host;
    this.#path = new PathLayer(caseId);
    this.#towers = new TowerLayer(caseId);

    // Draw order, from the reference: vessel, then cells and the ranges they claim, then
    // what they fire, then what is coming. Threats are never hidden behind anything.
    this.#world.addChild(
      this.#path.container,
      this.#towers.container,
      this.#beams.container,
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

  draw(state: SimState): void {
    this.#towers.draw(state);
    this.#beams.draw(state);
    this.#enemies.draw(state);
    this.#app.render();
  }

  destroy(): void {
    this.#path.destroy();
    this.#towers.destroy();
    this.#beams.destroy();
    this.#enemies.destroy();
    this.#app.destroy(true, { children: true, texture: true });
  }
}
