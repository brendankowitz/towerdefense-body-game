/**
 * The arithmetic behind the board effects, kept out of the layers so it can be asserted
 * without a GPU: everything a layer does with these is set a radius, a scale or an alpha.
 *
 * Nothing here is simulation state and nothing here reads a clock. A burst is a pure function
 * of the flash the simulation already counts down; a puff and a mote are pure functions of an
 * age the renderer keeps for itself; a load is a pure function of a bank the simulation was
 * already keeping. None of them can change what the simulation decides.
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

/**
 * Absorption — what a phagocyte does to the body it is holding, in two readings.
 *
 * The load is not motion at all. It is a plain function of `digested` against the kind's
 * `capacity`, the bank the simulation already keeps to decide when a cell has to rest, so a
 * cell that has broken down more matter carries a visibly bigger one and stays that size while
 * it works. That reading survives reduced motion untouched, and it is the reading that says
 * *why* a cell is about to stop.
 *
 * The motes are the action: matter coming off the body and crossing the tether into the cell.
 * That is the part reduced motion drops, which leaves the tether the board had before — still
 * saying which body this cell has taken, just no longer saying it is eating it.
 *
 * Neither pulses. A pulsing ring on this board means a threat is here now (spec §7), and a cell
 * feeding is an action it is taking, not a warning about where to look.
 */

/** Motes crossing one tether at once. Three reads as a stream; more reads as a dotted line. */
export const MOTE_COUNT = 3;

/** Seconds one mote takes to cross from the body to the cell taking it in. */
export const MOTE_SECONDS = 0.62;

/** What a mote is painted at, and so its size the moment it comes off the body. */
export const MOTE_RADIUS = 4.2;

const MOTE_ALPHA = 0.9;

/** Fraction of the crossing a mote spends arriving, so none of them pops into being. */
const MOTE_FADE_IN = 0.15;

/**
 * How far through its crossing mote `index` of `count` is, from 0 on the body to 1 at the cell.
 *
 * The train is spread evenly in phase rather than in distance. Because the crossing accelerates,
 * that leaves the motes bunched at the body and strung out towards the cell, and the gaps opening
 * as they go is what makes it read as matter being drawn off rather than as a line of dots.
 */
export function motePhase(age: number, index: number, count: number): number {
  const turns = age / MOTE_SECONDS + index / count;
  return turns - Math.floor(turns);
}

/**
 * Where along the tether a mote at this phase sits, as a fraction of the crossing.
 *
 * The average of a straight run and a quadratic one: it leaves at half speed and arrives at one
 * and a half, so it reads as being pulled in rather than as travelling under its own power.
 */
export function moteTravel(phase: number): number {
  const t = clamp01(phase);
  return (t + t * t) / 2;
}

/** Multiplier on `MOTE_RADIUS`. A mote is swallowed rather than parked: it arrives at nothing. */
export function moteScale(phase: number): number {
  const t = clamp01(phase);
  return 1 - t * t;
}

export function moteAlpha(phase: number): number {
  return MOTE_ALPHA * clamp01(phase / MOTE_FADE_IN);
}

/** An empty phagocyte's mark, which is the size it has always been drawn at. */
export const LOAD_MIN_RADIUS = 6;

/**
 * A full one. The cell body is 20 across with a 4 wide paper ring inside its edge, so the mark
 * has 16 to grow into — and stops well short of it. At 14 a full cell read as a paper ring with
 * a hole in it: technically inside the body, but with so little of the cell's own colour left
 * between mark and ring that the cell stopped looking like a phagocyte. Doubling the empty mark
 * is enough to read as filling up, and leaves the cell recognisably itself while it does.
 */
export const LOAD_MAX_RADIUS = 12;

/**
 * How full a phagocyte is, against the appetite its kind was given. An appetite tuned to
 * nothing draws an empty cell rather than a permanently full one — the same answer
 * `healthBarWidth` gives a body with no health to have.
 */
export function phagocyteFullness(digested: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return clamp01(digested / capacity);
}

export function loadRadius(fullness: number): number {
  return LOAD_MIN_RADIUS + (LOAD_MAX_RADIUS - LOAD_MIN_RADIUS) * clamp01(fullness);
}
