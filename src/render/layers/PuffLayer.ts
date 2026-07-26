import { Container, Graphics } from 'pixi.js';
import { PATHOGENS } from '@game/content/pathogens';
import type { SimState } from '@game/types';
import { pathogenHex } from '../colors';
import { isPuffAlive, puffAlpha, puffScale } from '../effects';
import { enemyRadius } from '../geometry';
import type { Motion } from '../motion';
import { ViewPool } from '../pool';
import { filledCircle } from '../shapes';

/**
 * Where an enemy was, and what it looked like, on the last frame that had one.
 *
 * The simulation removes a dead enemy immediately — that is the rule and it has not moved —
 * so by the time the renderer can tell that something died, the thing that died is gone.
 * These are the renderer's own copies, kept for exactly one frame's worth of hindsight.
 */
class Trace {
  id = 0;
  x = 0;
  y = 0;
  radius = 0;
  color = 0;
  /** Arc length along the vessel. Only ever used to tell a kill from a leak. */
  distance = 0;
  /** The frame this trace was last refreshed on. Anything older belongs to a departed enemy. */
  frame = 0;
  /** Set while a trace is being spent on a puff, so one death cannot buy two. */
  puffed = false;
}

class PuffView {
  readonly graphics = new Graphics();
  /** The dead enemy's id. Kept on the view so live puffs can be walked without entry pairs. */
  id = 0;
  age = 0;
  /**
   * The circle currently in the geometry. A puff grows by scaling what was painted once, so
   * the only thing that can force a repaint is being recycled for a different pathogen.
   */
  paintedColor = -1;
  paintedRadius = -1;
}

/**
 * Puffs where pathogens fell.
 *
 * Entirely presentational, and deliberately so: the simulation still removes an enemy the
 * instant it dies, pays the bounty on that same step and knows nothing about this file. The
 * layer watches the population it is handed, notices who left, and draws a fading circle at
 * the last place it saw them. Remove this file and every simulation outcome is identical.
 *
 * Views are pooled by the dead enemy's id, which is unique and never reissued, so a puff is
 * a `ViewPool` entry like everything else here: acquired on the frames it is alive for, and
 * released by the frame it stops being acquired on.
 */
export class PuffLayer {
  readonly container = new Container();
  readonly #pool: ViewPool<PuffView>;
  /**
   * Live puffs, by the id of the enemy each one is mourning. This is the layer's model; the
   * pool owns the display objects. Keeping the two apart is what lets a puff outlive the
   * entity it belongs to, which is the whole point of it.
   */
  readonly #puffs = new Map<number, PuffView>();
  readonly #traces = new Map<number, Trace>();
  /** Traces whose enemies are no longer on the board, refilled in place every frame. */
  readonly #gone: Trace[] = [];
  readonly #spare: Trace[] = [];
  #frame = 0;
  #state: SimState | null = null;
  #kills = 0;

  constructor() {
    this.#pool = new ViewPool<PuffView>({
      create: () => {
        const view = new PuffView();
        view.graphics.visible = false;
        this.container.addChild(view.graphics);
        return view;
      },
      attach: (view) => { view.graphics.visible = true; },
      detach: (view) => { view.graphics.visible = false; },
      destroy: (view) => { view.graphics.destroy(); },
    });
  }

  /**
   * `elapsedSeconds` is presentational time — however long the last frame was, in the same
   * scale the simulation just advanced by, so a puff at 2× is over twice as quickly and the
   * board never smears.
   */
  draw(state: SimState, elapsedSeconds: number, motion: Motion): void {
    if (state !== this.#state) this.#forget(state);

    // Kills the simulation counted since the last frame, which is exactly how many of the
    // enemies that left the board died. Under reduced motion nothing is ever spent.
    const budget = motion === 'reduced' ? 0 : Math.max(0, state.waveKills - this.#kills);
    this.#kills = state.waveKills;

    this.#trace(state);
    this.#spend(budget);
    this.#release();
    this.#advance(elapsedSeconds);
  }

  destroy(): void {
    this.#pool.destroyAll();
    this.container.destroy({ children: true });
  }

  /**
   * A restarted case is a new state object with its own ids and its own kill count, and one
   * run's tally says nothing about another's — so the count is re-baselined here rather than
   * subtracted from, which would otherwise read a fresh board's zero as a burst of deaths.
   *
   * The traces need no clearing: the frame that notices the new state is the same frame that
   * finds every trace belonging to the old one unrefreshed, and releases it.
   */
  #forget(state: SimState): void {
    this.#puffs.clear();
    this.#state = state;
    this.#kills = state.waveKills;
  }

  /** Refreshes a trace per living enemy, and collects the ones nobody refreshed. */
  #trace(state: SimState): void {
    this.#frame += 1;

    for (const enemy of state.enemies) {
      let trace = this.#traces.get(enemy.id);
      if (trace === undefined) {
        trace = this.#spare.pop() ?? new Trace();
        trace.id = enemy.id;
        this.#traces.set(enemy.id, trace);
      }
      trace.x = enemy.x;
      trace.y = enemy.y;
      trace.distance = enemy.distance;
      trace.radius = enemyRadius(PATHOGENS[enemy.kind].radius, enemy.generation);
      trace.color = pathogenHex(enemy.kind);
      trace.frame = this.#frame;
    }

    this.#gone.length = 0;
    for (const trace of this.#traces.values()) {
      if (trace.frame !== this.#frame) this.#gone.push(trace);
    }
  }

  /**
   * Opens a puff for each death, and only for a death.
   *
   * `waveKills` counts precisely the enemies the simulation paid a bounty for, so it bounds
   * what may be drawn: an enemy that left the board without being killed — one that leaked,
   * or the whole board being swept when a wave ends — buys nothing. When more left than were
   * killed, the ones nearest the start of the vessel are the kills, because a leak is by
   * definition the enemy that reached the end of it.
   */
  #spend(budget: number): void {
    for (let spent = 0; spent < budget; spent += 1) {
      let nearest: Trace | null = null;
      for (const trace of this.#gone) {
        if (trace.puffed) continue;
        if (nearest === null || trace.distance < nearest.distance) nearest = trace;
      }
      if (nearest === null) return;

      nearest.puffed = true;
      this.#open(nearest);
    }
  }

  #open(trace: Trace): void {
    const view = this.#pool.acquire(trace.id);
    view.id = trace.id;
    view.age = 0;

    if (view.paintedColor !== trace.color || view.paintedRadius !== trace.radius) {
      view.graphics.clear();
      filledCircle(view.graphics, 0, 0, trace.radius, trace.color);
      view.paintedColor = trace.color;
      view.paintedRadius = trace.radius;
    }
    view.graphics.position.set(trace.x, trace.y);
    this.#puffs.set(trace.id, view);
  }

  #release(): void {
    for (const trace of this.#gone) {
      this.#traces.delete(trace.id);
      trace.puffed = false;
      this.#spare.push(trace);
    }
    this.#gone.length = 0;
  }

  /**
   * Ages every live puff and hands the pool the ones still worth drawing. A puff that has
   * run out is dropped here and detached by `endFrame`, which is the same "not acquired this
   * frame" rule every other layer retires a view by.
   */
  #advance(elapsedSeconds: number): void {
    this.#pool.beginFrame();
    for (const view of this.#puffs.values()) {
      view.age += elapsedSeconds;
      if (!isPuffAlive(view.age)) {
        this.#puffs.delete(view.id);
        continue;
      }
      this.#pool.acquire(view.id);
      view.graphics.scale.set(puffScale(view.age));
      view.graphics.alpha = puffAlpha(view.age);
    }
    this.#pool.endFrame();
  }
}
