import { expect, test } from '@playwright/test';
import { CASE_BY_ID } from '../../src/game/content/cases';
import { TISSUE_PIPS, WAVE_CLEAR_ENERGY } from '../../src/game/content/rules';
import { onScreen, openCase, placeCell } from './helpers';

/**
 * THE ONE SANCTIONED BALANCE-COUPLED TEST IN THIS SUITE.
 *
 * Spec §13.1, and the design's pacing promise: the opening wave of the first case is winnable
 * with the starter cell alone, on a budget the case hands the player. Every other spec in
 * `tests/e2e/` asserts mechanics and navigation and never an outcome that depends on
 * damage-per-second beating hit-points-over-distance. This one does depend on exactly that,
 * on purpose. If a retune breaks it, the design has broken and not the test — retune, or
 * change the promise deliberately. Do not add a second test of this shape.
 *
 * The build is three phagocytes on the three spots that reach the vessel, well inside the
 * case's starting energy. Measured on this build, repeatedly: eight cleared, none through.
 *
 * Forearm is the only case where this build is even possible. A phagocyte's range is 56 and
 * forearm spots 0, 1 and 2 sit 55.2, 45.5 and 48.0 from the vessel; on throat and stomach
 * exactly one spot of five is inside that range. That is why the pacing promise is asserted
 * on wave 1 of case 1 and nowhere else — see the fixme below for what is *not* asserted.
 */

const FOREARM = CASE_BY_ID.forearm;

test('wave 1 of the first case is held by starter cells alone', async ({ page }) => {
  test.setTimeout(120_000);
  await openCase(page, 'forearm');

  for (const spot of [0, 1, 2]) await placeCell(page, 'forearm', 'phago', spot);

  // Double speed is a fixed-step multiplier, not a shortcut: the simulation takes the same
  // steps either way (`loop.test.ts`), so this only shortens the wall clock.
  await onScreen(page, 'speed').click();
  await expect(onScreen(page, 'speed')).toHaveText('2×');

  await onScreen(page, 'start-wave').click();
  await expect(onScreen(page, 'result-kicker'))
    .toHaveText(`WAVE 1 OF ${String(FOREARM.waves.length)} HELD`, { timeout: 90_000 });
  await expect(onScreen(page, 'result-leaks')).toHaveText('0');
  await expect(onScreen(page, 'result-reward')).toHaveText(`+${String(WAVE_CLEAR_ENERGY)}`);
  await expect(onScreen(page, 'pip')).toHaveCount(TISSUE_PIPS);
  await expect(onScreen(page, 'pip').and(page.locator('[data-lit="false"]'))).toHaveCount(0);

  await expect(onScreen(page, 'result-cta')).toHaveText('Build for wave 2');
  await onScreen(page, 'result-cta').click();
  await expect(onScreen(page, 'result-kicker')).toHaveCount(0);
  await expect(onScreen(page, 'start-wave')).toHaveText('Start wave 2');
  await expect(onScreen(page, 'fight-wave'))
    .toHaveText(`Wave 2 of ${String(FOREARM.waves.length)}`);
});

/**
 * NOT COVERED — BLOCKED ON BALANCE, NOT ON CODE.
 *
 * Spec §13.1's other half: "clearing one advances progression correctly". An exhaustive sweep
 * of every affordable board at the correct unlock tier, playing the real simulation, clears
 * forearm 0 times in 1024 and throat 0 times in 3125. Stomach clears 3 times in 7776 — 0.04%,
 * and unreachable in play because it is the third case and the two before it cannot be won.
 * So this cannot be written as a passing test and has deliberately not been shaped into one.
 *
 * An earlier version of this comment said no case was winnable at all. That was measured from
 * six hand-picked compositions rather than a sweep, and it was wrong about stomach. Corrected
 * after the holistic review searched the whole space.
 *
 * The body below has therefore never executed and is a statement of the promise, not verified
 * code — expect to rework it when the balance pass lands. What it would prove that nothing
 * else does: that a clear earned through real combat reaches storage and survives a reload.
 * Until then `progression.test.ts` covers the transition and `persistence.spec.ts` covers the
 * storage boundary, each on its own.
 */
test.fixme('clearing a case banks the reward and the clear survives a reload', async ({ page }) => {
  await openCase(page, 'forearm');

  for (let wave = 1; wave <= FOREARM.waves.length; wave += 1) {
    for (const spot of [0, 1, 2]) await placeCell(page, 'forearm', 'phago', spot);
    await onScreen(page, 'start-wave').click();
    await expect(onScreen(page, 'result-kicker')).toBeVisible({ timeout: 90_000 });
    await onScreen(page, 'result-cta').click();
  }

  await expect(page).toHaveURL('/');
  await expect(onScreen(page, 'held-count')).toHaveText(/^1 \//);
  await page.reload();
  await expect(onScreen(page, 'held-count')).toHaveText(/^1 \//);
});
