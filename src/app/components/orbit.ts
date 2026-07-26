/**
 * The ellipse the region under attack travels.
 *
 * The body map is inline SVG, so this is CSS rather than a renderer: the halo is animated by
 * a keyframe track of plain translations, which every engine can run off the compositor and
 * `prefers-reduced-motion` can switch off in one rule. The track is generated from the
 * ellipse rather than hand-written so there is one statement of the shape, and it is a pure
 * function of a phase, which is the part worth testing.
 *
 * Radii are user units in the map's own viewBox — the smallest node is 15 across, so a 14 by
 * 7 orbit reads as travel around a region rather than a wobble.
 */

export const ORBIT_RX = 14;
export const ORBIT_RY = 7;

/** The name shared with `.orbit` in typography.css. Nothing else may use it. */
export const ORBIT_ANIMATION = 'sickness-orbit';

/** Twelve chords around an ellipse; the corners are under a pixel at this size. */
const ORBIT_STEPS = 12;

/** Where on the ellipse a phase in [0, 1] sits, as an offset from the centre. */
export function orbitOffset(phase: number): readonly [x: number, y: number] {
  const angle = phase * Math.PI * 2;
  return [ORBIT_RX * Math.cos(angle), ORBIT_RY * Math.sin(angle)];
}

function round(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * The whole track, closing on its own start so an infinite run has no seam. Built once at
 * module load: it is the same for every node, and the map never resizes it.
 */
export function orbitKeyframes(steps: number = ORBIT_STEPS): string {
  const frames: string[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const phase = step / steps;
    const [x, y] = orbitOffset(phase);
    frames.push(`${round(phase * 100)}%{transform:translate(${round(x)}px,${round(y)}px)}`);
  }
  return `@keyframes ${ORBIT_ANIMATION}{${frames.join('')}}`;
}

export const ORBIT_KEYFRAMES = orbitKeyframes();
