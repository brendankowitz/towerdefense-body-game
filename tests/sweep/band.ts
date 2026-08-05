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
 * The cases the *ceiling* does not apply to, and nothing else. **Empty, and it should stay empty.**
 *
 * It held the heart, for one reason: this harness enters every case at the day and the clears a
 * clean season walk would reach it on, and for the last stand that is the whole season behind it
 * — the full dock, immunity at its cap,
 * and the largest bank the season can hand over. That is the most forgiving state any run could
 * arrive at the core in, and a real run arrives at the last stand having *lost* ground, so it
 * arrives with less of all three. Holding a ceiling against a number no run plays would have held
 * the case to the wrong thing, so it was deferred to the instrument that could measure the right
 * one.
 *
 * **That instrument landed and the deferral is over.** `tests/sweep/runSweep.ts` plays the heart's
 * whole board space at the arrivals runs actually make — median day 14 to 16, nothing or almost
 * nothing cleared — and the case was retuned against that rather than against this one (`cases.ts`
 * records the three passes and the range). Across the extremes of those arrivals it clears **5.3%
 * to 13.6%**, the floor of that range being the band floor and the ceiling of it being this
 * harness's own entry — which a run only reaches by having nearly won already. So the case is
 * inside the band at both ends and there is nothing left to exempt.
 *
 * The range is stated rather than the floor alone because an earlier pass recorded "5.3%, stable"
 * off four head-of-list arrival contexts that all happened to carry two points of immunity or
 * fewer. What actually moves this case is holding all three strains at once; one strain at its cap
 * is worth nothing. `runSweep.ts` now picks the extremes on purpose.
 *
 * **Re-measured with the memory response on: the arrivals moved, the case did not.** The same
 * instrument at 200 seeds now spans **5.3% to 6.9%** across the extremes of the 49 distinct
 * arrivals it saw — a narrower range than before, because arrivals shorten runs and the 13.0% row
 * was a run that had lasted 166 days. The board space at 3/3/3 is still 13.6%; nothing arrives
 * there. So the case is inside the band at both ends by more room than it was, and the exemption
 * stays retired.
 *
 * **And this harness now says why the last stand answers to it rather than to the board sweep, as
 * data.** `runSweep.ts`'s re-fight block counts how often each case is fought holding every strain
 * its own table sends at the cap. Under the policy every pacing number is chosen against, the heart
 * is fought that way **not once** — the only case in the season with that reading. Every other case
 * is met again with memory the board sweep's season-order entry never gives it; the last stand is
 * met once, at whatever the run had when the roads fell. The deferral in this docstring was an
 * argument; it is now also a measurement, from an instrument that could have contradicted it.
 *
 * Named rather than derived, and `band.test.ts` fails if this set grows — the same reason
 * `content.invariants.test.ts` names the four joints. Widening an exemption should cost a
 * decision, not a comma. **The re-fight arm is not a reason to grow it**, and `runSweep.ts` carries
 * the measurement behind that: three of the four re-fight contexts a previous round enumerated are
 * over this ceiling with `ARRIVALS_ENABLED` false, and the loudest of them is over it holding no
 * memory at all.
 */
export const CEILING_EXEMPT: ReadonlySet<CaseId> = new Set([]);

/**
 * The cases that are not points on the season's difficulty curve, which is a separate claim from
 * the ceiling exemption above: the curve checks compare cases in the order a run meets them, and
 * the last stand is not a row in that order. It is the end of a run, reached by losing ground
 * rather than by clearing the case before it, so its rate read as a season row would say the
 * season goes easier at the very end — which is not what it is.
 */
export const OFF_THE_CURVE: ReadonlySet<CaseId> = new Set(['heart']);
