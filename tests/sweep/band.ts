/**
 * The band the design is aiming at, from the holistic review (2026-07-26, §5): 5–15% of
 * affordable boards clearing, falling as the season progresses. Below the floor and the player
 * never stumbles into a win; above the ceiling and the board stops being a decision.
 *
 * Its own module because two sweeps now answer to it and neither owns it. `balance.sweep.ts`
 * asserts the band on a player who buys and never grows, which is the curve the season is tuned
 * to. `maturation.sweep.ts` asserts the *floor* against a player who takes a growth offer, which
 * is a different question with the same number behind it: growing a cell may make a case harder,
 * and may not make it a case nobody can win. Written twice, those two floors would drift, and the
 * day they did the second one would be measuring nothing in particular.
 */
export const CLEAR_RATE_FLOOR = 0.05;
export const CLEAR_RATE_CEILING = 0.15;
