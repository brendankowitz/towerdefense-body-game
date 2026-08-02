import { Container, Graphics } from 'pixi.js';
import { CASE_BY_ID } from '@game/content/cases';
import { ARRIVAL_USES } from '@game/content/rules';
import type { Arrival, CaseId, Point, SimState } from '@game/types';
import { defenderHex } from '../colors';
import { GROWTH_SECONDS, growthRingAlpha, growthRingRadius, isGrowthAlive } from '../effects';
import { pointOnCircle, quantise } from '../geometry';
import type { Motion } from '../motion';
import { ViewPool } from '../pool';
import { dashedRing, filledCircle, ring } from '../shapes';

/**
 * Help standing on a case's own mount points — drawn from `state.arrivals` alone, the same
 * arm's-length relationship `PuffLayer` keeps with the population it watches: nothing here
 * changes what `callArrivals` or `stepArrivals` decided, and removing this file changes no
 * simulation outcome.
 */

/** Radius of the dashed ring every arrival stands inside. The entrance closes onto this. */
const SOCKET_RADIUS = 10;
const SOCKET_WIDTH = 2.5;
const SOCKET_DASH = 4;
const SOCKET_GAP = 3;

/** How far a use's mark sits from the mount's centre, and how big one mark is drawn. */
const PIP_LAYOUT_RADIUS = 6;
const PIP_RADIUS = 3;

const ENTRANCE_RING_WIDTH = 2.5;

/** Steps the entrance is quantised to. Twelve is a repaint roughly every frame of it — the same
 * budget `TowerLayer`'s `GROWTH_STEPS` gives the flourish this one is copied from. */
const ENTRANCE_STEPS = 12;

function entranceStep(age: number, motion: Motion): number {
  if (motion === 'reduced' || !isGrowthAlive(age)) return 0;
  return 1 + quantise(age / GROWTH_SECONDS, ENTRANCE_STEPS);
}

/**
 * One mark per use left, laid out on a circle rather than a row: a single use sits dead centre
 * rather than at one end of a bar, so the arrangement never borrows the vocabulary of a gauge —
 * ammunition is counted, not read off a fill level.
 */
function pipPositions(count: number): readonly Point[] {
  if (count <= 0) return [];
  if (count === 1) return [[0, 0]];

  const positions: Point[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    positions.push(pointOnCircle(0, 0, PIP_LAYOUT_RADIUS, angle));
  }
  return positions;
}

/**
 * Everything that changes an arrival's drawing. `uses` is deliberately packed in rather than
 * quantised away: it is already a small integer a player can count, and a view whose count
 * changed but whose signature did not would keep showing marks that are no longer there — the
 * exact failure the count reading exists to avoid.
 */
function signatureOf(arrival: Arrival, entranceAge: number, motion: Motion): string {
  let packed = arrival.kind === 'antibody' ? 0 : 1;
  packed = packed * (ARRIVAL_USES + 1) + arrival.uses;
  packed = packed * (ENTRANCE_STEPS + 2) + entranceStep(entranceAge, motion);
  return String(packed);
}

/**
 * The ring closing onto an arrival's socket, the moment it lands.
 *
 * Reused wholesale from `TowerLayer`'s growth flourish rather than restated: both mark a
 * permanent change the simulation records on a single frame and then never revisits, so both
 * close inward onto the ring they leave behind. A burst's expanding front was the other
 * candidate on this board and was rejected on purpose — that vocabulary already means "a cell
 * just acted", and an arrival landing is the opposite of an action wearing itself out: it is
 * ammunition showing up, which is what a permanent ring arriving already says for a grown cell.
 */
function paintEntrance(g: Graphics, age: number, color: number): void {
  if (!isGrowthAlive(age)) return;
  ring(
    g, 0, 0, growthRingRadius(age, SOCKET_RADIUS), color,
    ENTRANCE_RING_WIDTH, growthRingAlpha(age),
  );
}

function paintArrival(g: Graphics, arrival: Arrival, entranceAge: number, motion: Motion): void {
  g.clear();
  const color = defenderHex(arrival.kind === 'antibody' ? 'anti' : 'nk');

  // The socket is what stays: it is what says "help is here" for as long as the arrival is,
  // and it is what the entrance ring closes onto rather than onto empty space.
  dashedRing(g, 0, 0, SOCKET_RADIUS, color, SOCKET_WIDTH, SOCKET_DASH, SOCKET_GAP);
  for (const [x, y] of pipPositions(arrival.uses)) filledCircle(g, x, y, PIP_RADIUS, color);
  if (motion === 'full') paintEntrance(g, entranceAge, color);
}

class ArrivalView {
  readonly body = new Graphics();
  /** Last painted appearance. See `TowerLayer`'s `TowerView.signature` for why empty repaints. */
  signature = '';
}

/**
 * Arrivals standing on the case's mount points.
 *
 * Keyed by mount index rather than by anything on `Arrival` — `callArrivals` never puts two
 * arrivals on the same mount at once, so a mount is exactly as reusable a key as a build spot
 * index is for `TowerLayer`, and for the same reason: there are at most as many of these as the
 * case has mounts, so the pool settles immediately and never grows again.
 */
export class ArrivalLayer {
  readonly container = new Container();
  readonly #caseId: CaseId;
  readonly #pool: ViewPool<ArrivalView>;
  /**
   * How long ago each mount's current arrival landed, and whether each mount was occupied last
   * frame. Both are the layer's own bookkeeping, kept for the reason `TowerLayer#growthAges` is:
   * an arrival landing is a discrete event the simulation records once and never re-announces —
   * there is no "just landed" flag on `Arrival` and there should not be one, so the layer watches
   * the field that does change (whether a mount is occupied) and keeps the clock itself.
   */
  readonly #entranceAges = new Map<number, number>();
  readonly #wasPresent = new Map<number, boolean>();

  constructor(caseId: CaseId) {
    this.#caseId = caseId;
    this.#pool = new ViewPool<ArrivalView>({
      create: () => {
        const view = new ArrivalView();
        view.body.visible = false;
        this.container.addChild(view.body);
        return view;
      },
      attach: (view) => { view.body.visible = true; },
      detach: (view) => {
        view.body.visible = false;
        view.signature = '';
      },
      destroy: (view) => { view.body.destroy(); },
    });
  }

  /**
   * `elapsedSeconds` is presentational time, the same frame `BoardRenderer` hands every other
   * layer — required rather than defaulted for the reason `TowerLayer.draw` gives.
   */
  draw(state: SimState, elapsedSeconds: number, motion: Motion): void {
    this.#ageEntrances(state, elapsedSeconds);

    this.#pool.beginFrame();
    const mounts = CASE_BY_ID[this.#caseId].mounts;
    for (const arrival of state.arrivals) {
      const mount = mounts[arrival.mountIndex];
      if (mount === undefined) continue;

      const entranceAge = this.#entranceAges.get(arrival.mountIndex) ?? Number.POSITIVE_INFINITY;
      const view = this.#pool.acquire(arrival.mountIndex);
      const signature = signatureOf(arrival, entranceAge, motion);
      if (signature !== view.signature) {
        paintArrival(view.body, arrival, entranceAge, motion);
        view.signature = signature;
      }
      view.body.position.set(mount[0], mount[1]);
    }
    this.#pool.endFrame();
  }

  /**
   * Notices a mount going from empty to occupied, and ages the flourish for one that already is.
   *
   * A mount seen occupied on the first frame this layer ever draws is *recorded* rather than
   * animated — the same rule `TowerLayer#ageGrowth` applies to a cell that was already grown
   * when the board appeared, and for the same reason: leaving the fight screen and coming back
   * must not replay an entrance the player already watched land.
   */
  #ageEntrances(state: SimState, elapsedSeconds: number): void {
    const mountCount = CASE_BY_ID[this.#caseId].mounts.length;
    const occupied = new Set(state.arrivals.map((arrival) => arrival.mountIndex));

    for (let mountIndex = 0; mountIndex < mountCount; mountIndex += 1) {
      const isOccupied = occupied.has(mountIndex);
      const before = this.#wasPresent.get(mountIndex);
      if (before === false && isOccupied) this.#entranceAges.set(mountIndex, 0);
      this.#wasPresent.set(mountIndex, isOccupied);

      const age = this.#entranceAges.get(mountIndex);
      if (age === undefined) continue;
      const aged = age + elapsedSeconds;
      if (isGrowthAlive(aged)) this.#entranceAges.set(mountIndex, aged);
      else this.#entranceAges.delete(mountIndex);
    }
  }

  destroy(): void {
    this.#pool.destroyAll();
    this.container.destroy({ children: true });
  }
}
