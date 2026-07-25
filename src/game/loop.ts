import { FAST_MULTIPLIER, STEP_SECONDS } from './content/rules';
import { step } from './step';
import type { DefenderKind, Phase, ResultKind, SimState } from './types';

/** Longer than this and the tab was backgrounded or the device stalled — the time is dropped. */
const MAX_FRAME_SECONDS = 0.25;
const MAX_STEPS_PER_FRAME = 8;
const HUD_INTERVAL_SECONDS = 0.1;

export interface HudSnapshot {
  readonly phase: Phase;
  readonly result: ResultKind | null;
  readonly energy: number;
  readonly tissue: number;
  readonly waveIndex: number;
  readonly waveCount: number;
  readonly selected: DefenderKind | null;
  readonly fast: boolean;
  readonly feverSeconds: number;
  readonly feverUsed: boolean;
  readonly enemyCount: number;
  /** Bit i is set when build spot i is occupied. Five spots, so no allocation. */
  readonly occupiedMask: number;
  readonly waveKills: number;
  readonly waveLeaks: number;
}

function isRunning(state: SimState): boolean {
  return state.phase === 'wave';
}

function readSnapshot(state: SimState): HudSnapshot {
  let occupiedMask = 0;
  for (const tower of state.towers) occupiedMask |= 1 << tower.spotIndex;

  return {
    phase: state.phase,
    result: state.result,
    energy: Math.max(0, Math.round(state.energy)),
    tissue: Math.max(0, state.tissue),
    waveIndex: state.waveIndex,
    waveCount: state.waveCount,
    selected: state.selected,
    fast: state.fast,
    feverSeconds: state.fever,
    feverUsed: state.feverUsed,
    enemyCount: state.enemies.length,
    occupiedMask,
    waveKills: state.waveKills,
    waveLeaks: state.waveLeaks,
  };
}

/** `feverSeconds` compares by whole seconds because that is how the HUD renders it. */
function sameSnapshot(a: HudSnapshot, b: HudSnapshot): boolean {
  return (
    a.phase === b.phase && a.result === b.result && a.energy === b.energy &&
    a.tissue === b.tissue && a.waveIndex === b.waveIndex && a.waveCount === b.waveCount &&
    a.selected === b.selected && a.fast === b.fast &&
    Math.ceil(a.feverSeconds) === Math.ceil(b.feverSeconds) && a.feverUsed === b.feverUsed &&
    a.enemyCount === b.enemyCount && a.occupiedMask === b.occupiedMask &&
    a.waveKills === b.waveKills && a.waveLeaks === b.waveLeaks
  );
}

/**
 * Owns the fixed-timestep accumulator and the throttled HUD store. It has no clock of its own:
 * whoever drives it passes elapsed seconds in, which is what keeps the simulation free of
 * browser globals and testable at any frame rate.
 */
export class GameLoop {
  readonly #state: SimState;
  readonly #listeners = new Set<() => void>();
  #accumulator = 0;
  #hudTimer = 0;
  #snapshot: HudSnapshot;
  #stepsTaken = 0;

  constructor(state: SimState) {
    this.#state = state;
    this.#snapshot = readSnapshot(state);
  }

  get state(): SimState {
    return this.#state;
  }

  get stepsTaken(): number {
    return this.#stepsTaken;
  }

  advance(elapsedSeconds: number): void {
    if (isRunning(this.#state)) {
      const scaled =
        Math.min(elapsedSeconds, MAX_FRAME_SECONDS) * (this.#state.fast ? FAST_MULTIPLIER : 1);
      this.#accumulator += scaled;

      let steps = 0;
      while (
        isRunning(this.#state) &&
        this.#accumulator >= STEP_SECONDS &&
        steps < MAX_STEPS_PER_FRAME
      ) {
        step(this.#state, STEP_SECONDS);
        this.#accumulator -= STEP_SECONDS;
        this.#stepsTaken += 1;
        steps += 1;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.#accumulator = 0;
    } else {
      this.#accumulator = 0;
    }

    this.#hudTimer += elapsedSeconds;
    if (this.#hudTimer >= HUD_INTERVAL_SECONDS) {
      this.#hudTimer = 0;
      this.publish();
    }
  }

  /** Call after any command so the HUD reflects it immediately rather than up to 100 ms late. */
  publish(): void {
    const next = readSnapshot(this.#state);
    if (sameSnapshot(this.#snapshot, next)) return;

    this.#snapshot = next;
    for (const listener of this.#listeners) listener();
  }

  getSnapshot = (): HudSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Drop accumulated time. Called when the page becomes visible again. */
  resetClock(): void {
    this.#accumulator = 0;
  }
}
