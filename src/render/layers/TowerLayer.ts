import { Container, Graphics, Text } from 'pixi.js';
import { CASE_BY_ID } from '@game/content/cases';
import { DEFENDERS, DEFENDER_ORDER } from '@game/content/defenders';
import { BUILD_SPOT_RADIUS, TOWER_MAX_HP } from '@game/content/rules';
import { statsFor } from '@game/systems/stats';
import type { CaseId, Enemy, PhagocyteTower, SimState, Tower } from '@game/types';
import {
  EMPTY_SPOT_CROSS, EMPTY_SPOT_FILL, EMPTY_SPOT_STROKE, PAPER, TOWER_HEALTH_TRACK,
  defenderHex, pathogenHex, tokenHex,
} from '../colors';
import {
  BURST_RING_WIDTH, LOAD_MAX_RADIUS, LOAD_MIN_RADIUS, MOTE_COUNT, MOTE_RADIUS,
  burstDiscAlpha, burstProgress, burstRingAlpha, burstRingRadius, loadRadius, moteAlpha,
  motePhase, moteScale, moteTravel, phagocyteFullness,
} from '../effects';
import { assertNever } from '../exhaustive';
import { healthBarWidth, quantise, squareToDiamondHalf } from '../geometry';
import type { Motion } from '../motion';
import { ViewPool } from '../pool';
import { bar, dashedRing, diamond, filledCircle, ring, thickLine } from '../shapes';

/** Prototype lines 843–872: a 20 body inside a 4 paper ring, health 30 above it. */
const BODY_RADIUS = 20;
const PAPER_RING_WIDTH = 4;
const HEALTH_TRACK_WIDTH = 28;
const HEALTH_BAR_HEIGHT = 4;
const HEALTH_BAR_OFFSET = 30;
const HEALTH_STEPS = HEALTH_TRACK_WIDTH;

/** A matured cell wears a second ring outside its body. Same vocabulary, one more coat. */
const MATURED_RING_RADIUS = 25;
const MATURED_RING_WIDTH = 2.5;

const TETHER_WIDTH = 9;
const XP_LABEL_OFFSET = 30;
const XP_LABEL_SIZE = 11;

const PREVIEW_RANGE_ALPHA = 0.09;
const RANGE_ALPHA = 0.1;
const CLOT_RANGE_ALPHA = 0.13;
const SPENT_ALPHA = 0.4;

/**
 * How finely a burst's pulse is followed. The flash lasts about a fifth of a second, so a
 * dozen steps is a repaint roughly every frame of it and none at all the rest of the time.
 */
const BURST_STEPS = 12;

/**
 * How finely a cell's load is followed. The mark grows by `LOAD_MAX_RADIUS - LOAD_MIN_RADIUS`
 * over a full cell, so one step is one pixel of it and the body repaints once per pixel of
 * growth rather than on every frame of a continuous fill.
 */
const LOAD_STEPS = LOAD_MAX_RADIUS - LOAD_MIN_RADIUS;

/** Seconds of burst left on a cell. Zero for everything that is not a mast cell. */
function burstFlashOf(tower: Tower): number {
  return tower.kind === 'mast' ? tower.flash : 0;
}

/** How full a cell is of matter it has broken down. Zero for everything that does not eat. */
function loadOf(tower: Tower): number {
  if (tower.kind !== 'phago') return 0;
  return phagocyteFullness(tower.digested, statsFor(tower).capacity);
}

/**
 * How far a burst has run, quantised for the appearance signature. Zero means "not bursting";
 * under reduced motion a burst is one static state rather than a sequence, so it collapses to
 * a single step and never asks for a repaint.
 */
function burstStep(flash: number, motion: Motion): number {
  if (flash <= 0) return 0;
  if (motion === 'reduced') return 1;
  return 1 + quantise(burstProgress(flash), BURST_STEPS);
}

/** A cell that cannot act right now: stunned by a toxin, or a phagocyte resting off a full load. */
function isSpent(tower: Tower): boolean {
  if (tower.stun > 0) return true;
  return tower.kind === 'phago' && tower.rest > statsFor(tower).gap;
}

/**
 * Everything that changes a cell's drawing rather than its position. Earned XP is deliberately
 * absent: it lives on its own label, which compares separately, so a memory cell learning does
 * not rebuild the whole body.
 *
 * Range is here and cannot be packed with the rest — it is a tunable, so it is an arbitrary
 * float rather than one of a small set of states. Without it a range moved in the tuning panel
 * left the ring on screen at its old radius until something else about the cell changed, which
 * is the one thing a balance session most needs to see.
 *
 * Whether a phagocyte is holding anything is deliberately absent. It used to bump the mark and
 * so had to be compared; the mark now follows the load instead, and what a cell is holding is
 * said by the tether that runs to it.
 */
function signatureOf(tower: Tower, motion: Motion): string {
  let packed = DEFENDER_ORDER.indexOf(tower.kind);
  packed = packed * (HEALTH_STEPS + 1) + quantise(tower.hp / TOWER_MAX_HP, HEALTH_STEPS);
  packed = packed * 2 + (isSpent(tower) ? 1 : 0);
  packed = packed * (LOAD_STEPS + 1) + quantise(loadOf(tower), LOAD_STEPS);
  packed = packed * (BURST_STEPS + 2) + burstStep(burstFlashOf(tower), motion);
  packed = packed * 2 + (tower.matured ? 1 : 0);
  return `${String(packed)}:${String(statsFor(tower).range)}`;
}

/**
 * The inner mark that says what a cell does. Cut out of the body in paper, never outlined.
 *
 * A phagocyte's is the one that moves: it grows with the matter the cell has broken down and
 * empties when the cell dumps its load and goes to rest, so a cell about to stop for a long
 * one is visibly full before it stops.
 */
function paintGlyph(g: Graphics, tower: Tower, spent: boolean): void {
  switch (tower.kind) {
    case 'phago':
      filledCircle(g, 0, 0, loadRadius(loadOf(tower)), PAPER, spent ? 0.5 : 1);
      return;
    case 'anti':
      bar(g, -8, -3, 16, 6, 3, PAPER);
      return;
    case 'clot':
      ring(g, 0, 0, 7, PAPER, 3.5);
      return;
    case 'nk':
      diamond(g, 0, 0, squareToDiamondHalf(6), PAPER);
      return;
    case 'mast':
      filledCircle(g, 0, -7, 3.2, PAPER);
      filledCircle(g, -6, 4, 3.2, PAPER);
      filledCircle(g, 6, 4, 3.2, PAPER);
      return;
    case 'mem':
      ring(g, 0, 0, 8, PAPER, 3);
      filledCircle(g, 0, 0, 3, PAPER);
      return;
    default:
      assertNever(tower);
  }
}

/**
 * A burst hits everything in reach at once, so it is drawn as one: the whole disc lights,
 * and a front leaves the cell's edge and arrives at the edge of its range as the light goes
 * out. It is the cell acting, not decoration — under reduced motion the front is dropped and
 * the lit disc stays, which is what a burst looked like before it had one.
 */
function paintBurst(g: Graphics, flash: number, range: number, color: number, motion: Motion): void {
  if (flash <= 0) return;

  if (motion === 'reduced') {
    filledCircle(g, 0, 0, range, color, burstDiscAlpha(0));
    return;
  }

  const progress = burstProgress(flash);
  filledCircle(g, 0, 0, range, color, burstDiscAlpha(progress));
  ring(
    g, 0, 0, burstRingRadius(progress, BODY_RADIUS, range), color,
    BURST_RING_WIDTH, burstRingAlpha(progress),
  );
}

function paintBody(g: Graphics, tower: Tower, motion: Motion): void {
  g.clear();
  const stats = statsFor(tower);
  const color = defenderHex(tower.kind);
  const spent = isSpent(tower);
  const alpha = spent ? SPENT_ALPHA : 1;

  if (tower.kind === 'clot') {
    filledCircle(g, 0, 0, stats.range, color, CLOT_RANGE_ALPHA);
    dashedRing(g, 0, 0, stats.range, color, 2.5, 7, 6, 0.6);
  } else {
    filledCircle(g, 0, 0, stats.range, color, RANGE_ALPHA);
  }
  paintBurst(g, burstFlashOf(tower), stats.range, color, motion);

  filledCircle(g, 0, 0, BODY_RADIUS, color, alpha);
  ring(g, 0, 0, BODY_RADIUS, PAPER, PAPER_RING_WIDTH, alpha);
  if (tower.matured) ring(g, 0, 0, MATURED_RING_RADIUS, color, MATURED_RING_WIDTH, alpha);
  if (spent) dashedRing(g, 0, 0, BODY_RADIUS, color, 3, 4, 6);

  paintGlyph(g, tower, spent);

  if (tower.hp < TOWER_MAX_HP) {
    const left = -HEALTH_TRACK_WIDTH / 2;
    const top = -HEALTH_BAR_OFFSET;
    bar(g, left, top, HEALTH_TRACK_WIDTH, HEALTH_BAR_HEIGHT, 2, TOWER_HEALTH_TRACK);
    bar(
      g, left, top, healthBarWidth(HEALTH_TRACK_WIDTH, tower.hp, TOWER_MAX_HP),
      HEALTH_BAR_HEIGHT, 2, color,
    );
  }
}

class TowerView {
  readonly body = new Graphics();
  /**
   * Last painted appearance. The empty string means "never painted" — `signatureOf` always
   * emits at least one digit, so it compares unequal to every real signature and a recycled
   * view always repaints for its new cell.
   */
  signature = '';
}

class LabelView {
  readonly text = new Text({
    text: '',
    style: { fontFamily: 'DM Mono, monospace', fontSize: XP_LABEL_SIZE, fill: defenderHex('mem') },
  });
  /** Last printed value. NaN means "never printed". */
  value = Number.NaN;

  constructor() {
    this.text.anchor.set(0.5);
  }
}

/**
 * One lump of matter crossing a tether.
 *
 * Painted once at `MOTE_RADIUS` and scaled down from there, never up: Pixi tessellates a circle
 * from the radius it was built at, so a mote grown from a smaller one would arrive as a polygon.
 * The only thing that can force a repaint is the cell starting on a body of a different kind.
 */
class MoteView {
  readonly graphics = new Graphics();
  /** The colour currently in the geometry. -1 is no colour Pixi accepts, so it means unpainted. */
  paintedColor = -1;
}

/**
 * Cells and the spots they stand on. Both are keyed by build spot index, of which there
 * are five, so the pools here settle at five views and never move again.
 */
export class TowerLayer {
  readonly container = new Container();
  readonly #caseId: CaseId;
  readonly #spots = new Graphics();
  readonly #tethers = new Graphics();
  readonly #motes = new Container();
  readonly #bodies = new Container();
  readonly #labels = new Container();
  readonly #bodyPool: ViewPool<TowerView>;
  readonly #labelPool: ViewPool<LabelView>;
  readonly #motePool: ViewPool<MoteView>;
  /**
   * How long each feeding cell has been feeding, by build spot. Kept per cell rather than shared,
   * so two phagocytes that grabbed at different moments do not draw the same picture; and only
   * advanced on the frames a cell is actually holding something, so a cell that pauses between
   * bodies picks its stream back up where it left it.
   */
  readonly #moteAges = new Map<number, number>();
  #spotsSignature = '';

  constructor(caseId: CaseId) {
    this.#caseId = caseId;
    // Motes ride over the tether and under the bodies, so a mote that reaches a cell goes
    // behind it rather than sitting on top of the mark it is being added to.
    this.container.addChild(this.#spots, this.#tethers, this.#motes, this.#bodies, this.#labels);

    this.#bodyPool = new ViewPool<TowerView>({
      create: () => {
        const view = new TowerView();
        view.body.visible = false;
        this.#bodies.addChild(view.body);
        return view;
      },
      attach: (view) => { view.body.visible = true; },
      detach: (view) => {
        view.body.visible = false;
        view.signature = '';
      },
      destroy: (view) => { view.body.destroy(); },
    });

    this.#labelPool = new ViewPool<LabelView>({
      create: () => {
        const view = new LabelView();
        view.text.visible = false;
        this.#labels.addChild(view.text);
        return view;
      },
      attach: (view) => { view.text.visible = true; },
      detach: (view) => {
        view.text.visible = false;
        view.value = Number.NaN;
      },
      destroy: (view) => { view.text.destroy(); },
    });

    this.#motePool = new ViewPool<MoteView>({
      create: () => {
        const view = new MoteView();
        view.graphics.visible = false;
        this.#motes.addChild(view.graphics);
        return view;
      },
      attach: (view) => { view.graphics.visible = true; },
      detach: (view) => { view.graphics.visible = false; },
      destroy: (view) => { view.graphics.destroy(); },
    });
  }

  /**
   * `elapsedSeconds` is presentational time — the frame the caller measured, in the scale the
   * simulation just advanced by. Required rather than defaulted, the way `PuffLayer` takes it:
   * a default of zero would leave every mote parked without saying so.
   */
  draw(state: SimState, elapsedSeconds: number, motion: Motion): void {
    this.#drawSpots(state);
    this.#drawBodies(state, motion);
    this.#drawLabels(state);
    this.#drawTethers(state, elapsedSeconds, motion);
  }

  #drawBodies(state: SimState, motion: Motion): void {
    this.#bodyPool.beginFrame();
    for (const tower of state.towers) {
      const view = this.#bodyPool.acquire(tower.spotIndex);
      const signature = signatureOf(tower, motion);
      if (signature !== view.signature) {
        paintBody(view.body, tower, motion);
        view.signature = signature;
      }
      view.body.position.set(tower.x, tower.y);
    }
    this.#bodyPool.endFrame();
  }

  /** A memory cell prints what it has learned. Nothing else on the board carries a number. */
  #drawLabels(state: SimState): void {
    this.#labelPool.beginFrame();
    for (const tower of state.towers) {
      if (tower.kind !== 'mem') continue;
      const value = Math.round(tower.xp);
      if (value <= 0) continue;

      const view = this.#labelPool.acquire(tower.spotIndex);
      if (value !== view.value) {
        view.text.text = `+${String(value)}`;
        view.value = value;
      }
      view.text.position.set(tower.x, tower.y + XP_LABEL_OFFSET);
    }
    this.#labelPool.endFrame();
  }

  #drawSpots(state: SimState): void {
    const showing = state.phase === 'build' || state.phase === 'built';
    let occupied = 0;
    for (const tower of state.towers) occupied |= 1 << tower.spotIndex;

    const selected = state.selected === null ? 0 : DEFENDER_ORDER.indexOf(state.selected) + 1;
    let packed = showing ? 1 : 0;
    packed = packed * (1 << CASE_BY_ID[this.#caseId].spots.length) + occupied;
    packed = packed * (DEFENDER_ORDER.length + 1) + selected;

    // The reach preview draws the picked cell's range, so a tuned range has to reach this
    // comparison — same reason it is in `signatureOf`, same reason it cannot be packed.
    const previewRange = state.selected === null ? 0 : DEFENDERS[state.selected].range;
    const signature = `${String(packed)}:${String(previewRange)}`;
    if (signature === this.#spotsSignature) return;
    this.#spotsSignature = signature;

    this.#spots.clear();
    if (!showing) return;

    // The reference lights every open spot in one colour the moment anything is picked up,
    // rather than in the colour of what was picked up: it answers "where can this go".
    const stroke = state.selected === null ? EMPTY_SPOT_STROKE : tokenHex('frontline');
    const picked = state.selected === null ? null : DEFENDERS[state.selected];

    CASE_BY_ID[this.#caseId].spots.forEach(([x, y], index) => {
      if ((occupied & (1 << index)) !== 0) return;
      // Reach preview. Spots sit as far as 93 from the vessel while most cells reach 54-78,
      // so without this a player can spend on a cell that can never fire and only find out
      // by losing the wave. Showing the ring before the tap answers "will this reach".
      if (picked !== null) {
        filledCircle(this.#spots, x, y, picked.range, defenderHex(picked.kind), PREVIEW_RANGE_ALPHA);
        dashedRing(this.#spots, x, y, picked.range, defenderHex(picked.kind), 1.5, 5, 7, 0.45);
      }
      filledCircle(this.#spots, x, y, BUILD_SPOT_RADIUS, EMPTY_SPOT_FILL, 0.5);
      dashedRing(this.#spots, x, y, BUILD_SPOT_RADIUS, stroke, 3, 6, 6);
      bar(this.#spots, x - 7, y - 1.5, 14, 3, 1.5, EMPTY_SPOT_CROSS);
      bar(this.#spots, x - 1.5, y - 7, 3, 14, 1.5, EMPTY_SPOT_CROSS);
    });
  }

  /**
   * A phagocyte and the body it is taking in.
   *
   * Both ends move every frame while the cell drags its prey, so the tether itself is nothing
   * worth caching — there are at most five of these and usually none. What rides on it is
   * pooled: matter comes off the body in the pathogen's own colour and crosses into the cell,
   * which is the difference between a cell holding something and a cell eating it.
   *
   * Under reduced motion the tether is drawn and nothing crosses it. That is the state the
   * board had before, and it is kept rather than dropped because the tether carries a fact —
   * which body this cell has taken — that no other mark on the board states.
   */
  #drawTethers(state: SimState, elapsedSeconds: number, motion: Motion): void {
    this.#tethers.clear();
    this.#motePool.beginFrame();

    for (const tower of state.towers) {
      if (tower.kind !== 'phago' || tower.holdingEnemyId === null) continue;
      const prey = state.enemies.find((enemy) => enemy.id === tower.holdingEnemyId);
      if (prey === undefined) continue;

      thickLine(
        this.#tethers, tower.x, tower.y, prey.x, prey.y,
        defenderHex('phago'), TETHER_WIDTH, 0.5,
      );
      if (motion === 'reduced') continue;
      this.#drawMotes(tower, prey, this.#advanceMotes(tower.spotIndex, elapsedSeconds));
    }

    this.#motePool.endFrame();
  }

  /** Where this cell's stream has got to, one frame on. */
  #advanceMotes(spotIndex: number, elapsedSeconds: number): number {
    const age = (this.#moteAges.get(spotIndex) ?? 0) + elapsedSeconds;
    this.#moteAges.set(spotIndex, age);
    return age;
  }

  /**
   * The train, from under the body it is coming off to the wall of the cell taking it in.
   *
   * Motes start at the prey's own centre, so each one emerges from behind a pathogen the enemy
   * layer draws over the top of them, and end at the cell's edge, having shrunk to nothing. A
   * body standing closer than that edge has no crossing left to make and gets none.
   */
  #drawMotes(tower: PhagocyteTower, prey: Enemy, age: number): void {
    const towardsCellX = tower.x - prey.x;
    const towardsCellY = tower.y - prey.y;
    const gap = Math.hypot(towardsCellX, towardsCellY);
    if (gap <= BODY_RADIUS) return;

    const crossing = gap - BODY_RADIUS;
    const color = pathogenHex(prey.kind);

    for (let index = 0; index < MOTE_COUNT; index += 1) {
      const view = this.#motePool.acquire(tower.spotIndex * MOTE_COUNT + index);
      if (view.paintedColor !== color) {
        view.graphics.clear();
        filledCircle(view.graphics, 0, 0, MOTE_RADIUS, color);
        view.paintedColor = color;
      }

      const phase = motePhase(age, index, MOTE_COUNT);
      const travelled = crossing * moteTravel(phase);
      view.graphics.position.set(
        prey.x + (towardsCellX / gap) * travelled,
        prey.y + (towardsCellY / gap) * travelled,
      );
      view.graphics.scale.set(moteScale(phase));
      view.graphics.alpha = moteAlpha(phase);
    }
  }

  destroy(): void {
    this.#bodyPool.destroyAll();
    this.#labelPool.destroyAll();
    this.#motePool.destroyAll();
    this.container.destroy({ children: true });
  }
}
