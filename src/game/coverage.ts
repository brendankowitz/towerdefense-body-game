import { PATHOGENS } from './content/pathogens';
import type { Point } from './types';

/**
 * How much of a case's vessel a cell standing on a build spot can actually fight over.
 *
 * Lives in `src/game` for the same reason `testing.ts` does: it is authoring and test support, not
 * a screen, so it obeys the same no-DOM, no-framework rule as the simulation it measures. Nothing
 * the player runs calls it.
 *
 * **It is here because it was written twice.** `content.invariants.test.ts` owned a copy to assert
 * the dwell floor, and the second copy lived in a scratch script — which is where the fact that
 * measles had the thinnest board in the season was eventually found, three tuning passes in. Two
 * definitions of the same geometry means the number that gates and the number an author reads can
 * drift, and the one an author reads is the one that is not in the repo at all.
 */

/**
 * Arc length of `path` lying within `range` of `spot`.
 *
 * Solved per segment rather than sampled: a point on segment A + t·d is inside the circle when
 * |A + t·d − S|² ≤ r², a quadratic in t whose roots clamped to [0, 1] bound exactly the covered
 * stretch. Segments partition the path, so summing them double-counts nothing.
 */
export function coveredArc(spot: Point, path: readonly Point[], range: number): number {
  let covered = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    if (a === undefined || b === undefined) continue;

    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const fx = a[0] - spot[0];
    const fy = a[1] - spot[1];

    const qa = dx * dx + dy * dy;
    if (qa === 0) continue;
    const qb = 2 * (fx * dx + fy * dy);
    const qc = fx * fx + fy * fy - range * range;

    const discriminant = qb * qb - 4 * qa * qc;
    if (discriminant <= 0) continue;

    const root = Math.sqrt(discriminant);
    const enter = Math.max(0, (-qb - root) / (2 * qa));
    const leave = Math.min(1, (-qb + root) / (2 * qa));
    if (leave > enter) covered += (leave - enter) * Math.sqrt(qa);
  }
  return covered;
}

/**
 * Measured at the *slowest* pathogen, which is the most generous reading: the slowest thing on the
 * board dwells the longest, so a spot that fails at this speed fails for everything. Using the
 * fastest would turn every number below into a balance claim, and content values are not asserted
 * (spec §4).
 */
export const SLOWEST_PATHOGEN_SPEED = Math.min(
  ...Object.values(PATHOGENS).map((pathogen) => pathogen.speed),
);

/** Seconds the slowest pathogen spends inside `range` of `spot`. */
export function dwellSeconds(spot: Point, path: readonly Point[], range: number): number {
  return coveredArc(spot, path, range) / SLOWEST_PATHOGEN_SPEED;
}
