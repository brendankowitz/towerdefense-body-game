import { expect, test } from '@playwright/test';
import { CASE_BY_ID } from '../../src/game/content/cases';
import { DEFENDERS } from '../../src/game/content/defenders';
import { TISSUE_PIPS, WAVE_CLEAR_ENERGY } from '../../src/game/content/rules';
import type { DefenderKind } from '../../src/game/types';
import { onScreen, openCase, placeCell } from './helpers';

/**
 * THE ONLY TWO BALANCE-COUPLED TESTS IN THIS SUITE.
 *
 * Spec §13.1, and the design's pacing promise: the opening wave of the first case is winnable
 * with the starter cell alone, and the case as a whole is winnable on a board a player can
 * afford. Every other spec in `tests/e2e/` asserts mechanics and navigation and never an outcome
 * that depends on damage-per-second beating hit-points-over-distance. These two do depend on
 * exactly that, on purpose. If a retune breaks one, the design has broken and not the test —
 * retune, or change the promise deliberately. Do not add a third test of this shape.
 *
 * Both boards below came out of `npm run sweep` (`tests/sweep/`), which plays every affordable
 * board of every case through the real simulation. When a tuning moves, re-run it and take the
 * new boards from its output rather than guessing at one here.
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
 * Spec §13.1's other half: "clearing one advances progression correctly". This is the only test
 * anywhere that proves a clear earned through real combat reaches storage and survives a reload —
 * `progression.test.ts` covers the transition and `persistence.spec.ts` covers the storage
 * boundary, each with the other half assumed.
 *
 * It was `test.fixme` for as long as no case was winnable. It is not any more: forearm clears on
 * 283 of its 3125 affordable boards, and this is one of them —
 * `anti` on 0, `mast` on 1, phagocytes on 2, 3 and 4, finishing on all five pips with nothing
 * through. Listed cheapest-first, and bought that way, because that is the policy the sweep
 * measured: the board is an intent the economy fills in over the first three waves, not a
 * starting position.
 */
const WINNING_BOARD: readonly (readonly [DefenderKind, number])[] = [
  ['phago', 2], ['phago', 3], ['phago', 4], ['anti', 0], ['mast', 1],
];

test('clearing a case banks the reward and the clear survives a reload', async ({ page }) => {
  test.setTimeout(600_000);
  await openCase(page, 'forearm');

  await onScreen(page, 'speed').click();
  await expect(onScreen(page, 'speed')).toHaveText('2×');

  for (let wave = 1; wave <= FOREARM.waves.length; wave += 1) {
    for (const [kind, spot] of WINNING_BOARD) {
      if (await onScreen(page, `cell-chip-${String(spot)}`).count() > 0) continue;
      const energy = Number(await onScreen(page, 'energy').innerText());
      if (energy < DEFENDERS[kind].cost) continue;
      await placeCell(page, 'forearm', kind, spot);
    }

    await onScreen(page, 'start-wave').click();
    await expect(onScreen(page, 'result-kicker')).toBeVisible({ timeout: 120_000 });
    await expect(onScreen(page, 'result-leaks')).toHaveText('0');
    await onScreen(page, 'result-cta').click();
  }

  await expect(page).toHaveURL('/');
  await expect(onScreen(page, 'held-count')).toHaveText(/^1 \//);
  await page.reload();
  await expect(onScreen(page, 'held-count')).toHaveText(/^1 \//);
});
