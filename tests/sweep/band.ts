import type { CaseId } from '../../src/game/types';

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

/**
 * The cases the *ceiling* does not apply to, and nothing else — the floor still does, and a case
 * off the season curve is the separate decision below.
 *
 * The heart, for one reason: this harness enters every case at `clearedCount` cases cleared, and
 * for the last stand that is every one of them — the full dock, immunity at its cap, and the
 * largest bank the season can hand over. That is the most forgiving state any run could possibly
 * arrive at the core in, and a real run arrives at the last stand having *lost* ground, so it
 * arrives with less of all three. The rate measured here is a ceiling on a ceiling, and holding a
 * ceiling against it would hold the case to a number no run actually plays. The floor is a
 * different question and stays: a board nobody can win is a board nobody can win, whatever the run
 * brought to it.
 *
 * This is a deferral, not a claim that the last stand answers to nothing. The instrument that can
 * measure it is the whole-run sweep (Task 13); until that lands, this case's ceiling is unmeasured
 * and this comment is the only place that says so.
 *
 * Named rather than derived, and `band.test.ts` fails if either set grows — the same reason
 * `content.invariants.test.ts` names the four joints. Widening an exemption should cost a
 * decision, not a comma.
 */
export const CEILING_EXEMPT: ReadonlySet<CaseId> = new Set(['heart']);

/**
 * The cases that are not points on the season's difficulty curve, which is a separate claim from
 * the ceiling exemption above: the curve checks compare cases in the order a run meets them, and
 * the last stand is not a row in that order. It is the end of a run, reached by losing ground
 * rather than by clearing the case before it, so its rate read as a season row would say the
 * season goes easier at the very end — which is not what it is.
 */
export const OFF_THE_CURVE: ReadonlySet<CaseId> = new Set(['heart']);
