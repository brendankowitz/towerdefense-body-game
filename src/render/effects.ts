/**
 * The arithmetic behind the two board effects, kept out of the layers so it can be asserted
 * without a GPU: everything a layer does with these is set a radius, a scale or an alpha.
 *
 * Nothing here is simulation state and nothing here reads a clock. A burst is a pure function
 * of the flash the simulation already counts down; a puff is a pure function of an age the
 * renderer keeps for itself. Neither can change what the simulation decides.
 */

/**
 * How long a mast cell's flash lasts. The simulation sets `tower.flash = 0.18` in
 * `systems/damage.ts` and the renderer may not import it, so this is a restatement — a
 * deliberate one: every reader below clamps, so if that number moves the pulse arrives
 * early or late and never draws something impossible.
 */
export const BURST_SECONDS = 0.18;

/** Stroke width of the expanding ring. Thin, so it reads as a front rather than a band. */
export const BURST_RING_WIDTH = 3;

/**
 * How long a puff lasts. Short on purpose: the kill itself is instant and the energy has
 * already ticked up, so this is an echo of feedback that has landed, not the feedback.
 */
export const PUFF_SECONDS = 0.26;

/** Translucent throughout, which is the constraint: a puff may never hide what is behind it. */
const PUFF_PEAK_ALPHA = 0.4;
const PUFF_END_SCALE = 2.1;

const BURST_RING_ALPHA = 0.5;
const BURST_DISC_ALPHA = 0.22;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Decelerating. Effects leave fast and settle, which is what makes them read as a release. */
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** 0 the instant a burst lands, 1 once its flash has run out. */
export function burstProgress(flashRemaining: number): number {
  return clamp01(1 - flashRemaining / BURST_SECONDS);
}

/** The pulse leaves the cell's own edge and arrives at the edge of what it hit. */
export function burstRingRadius(
  progress: number, fromRadius: number, toRadius: number,
): number {
  return fromRadius + (toRadius - fromRadius) * easeOut(clamp01(progress));
}

export function burstRingAlpha(progress: number): number {
  return BURST_RING_ALPHA * (1 - clamp01(progress));
}

/**
 * The disc says "everything inside here was hit at once". It fades out under the ring rather
 * than blinking off, so the two read as one event.
 */
export function burstDiscAlpha(progress: number): number {
  return BURST_DISC_ALPHA * (1 - clamp01(progress));
}

/** A puff that has aged out draws nothing, so the layer stops carrying it. */
export function isPuffAlive(age: number): boolean {
  return age >= 0 && age < PUFF_SECONDS;
}

/**
 * Multiplier on the pathogen's own radius. The layer scales a circle it painted once rather
 * than rebuilding its geometry every frame, so this is a transform rather than a size.
 */
export function puffScale(age: number): number {
  return 1 + (PUFF_END_SCALE - 1) * easeOut(clamp01(age / PUFF_SECONDS));
}

export function puffAlpha(age: number): number {
  return PUFF_PEAK_ALPHA * (1 - clamp01(age / PUFF_SECONDS));
}
