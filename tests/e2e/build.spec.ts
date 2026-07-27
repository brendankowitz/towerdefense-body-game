import { expect, test } from '@playwright/test';
import { CASE_BY_ID } from '../../src/game/content/cases';
import { DEFENDERS, DEFENDER_BLURBS } from '../../src/game/content/defenders';
import { maturedChanges, maturedFormOf } from '../../src/game/content/maturation';
import { BUILD_SPOT_RADIUS, REABSORB_REFUND } from '../../src/game/content/rules';
import type { Point } from '../../src/game/types';
import { onScreen, openCase, placeCell, screen, tapSpot, tapWorld } from './helpers';

/**
 * Spec §13.4 — the build phase's mechanics, exercised through a real canvas.
 *
 * The unit suites already prove `placeDefender`, `reabsorbDefender` and `matureDefender`.
 * What only a browser can prove is that a tap at a screen coordinate reaches the right build
 * spot at all, which is the whole contain-fit path from `fitViewport` through `screenToWorld`
 * to `hitBuildSpot`. Every figure below is derived from content, never typed in.
 */

const FOREARM = CASE_BY_ID.forearm;

/** Mid-board, and asserted at run time to be well clear of every build spot. */
const EMPTY_TISSUE: Point = [187, 215];

/** The refund rule restated, exactly as `refundOf` states it. Whole units, never more than went in. */
function refundOf(spent: number): number {
  return Math.floor(spent * REABSORB_REFUND);
}

test('placing a cell charges its cost and taps land on the spot that was aimed at', async ({ page }) => {
  await openCase(page, 'forearm');
  await expect(onScreen(page, 'energy')).toHaveText(String(FOREARM.startingEnergy));
  await expect(onScreen(page, 'placed-cells')).toContainText('NONE YET');

  await placeCell(page, 'forearm', 'phago', 2);
  await expect(onScreen(page, 'energy'))
    .toHaveText(String(FOREARM.startingEnergy - DEFENDERS.phago.cost));
  await expect(onScreen(page, 'cell-chip-2'))
    .toContainText(DEFENDER_BLURBS.phago.name.split(' · ')[0] ?? DEFENDERS.phago.label);
  await expect(onScreen(page, 'cell-chip-0')).toHaveCount(0);

  await placeCell(page, 'forearm', 'clot', 0);
  await expect(onScreen(page, 'energy'))
    .toHaveText(String(FOREARM.startingEnergy - DEFENDERS.phago.cost - DEFENDERS.clot.cost));
});

test('a tap on bare tissue builds nothing', async ({ page }) => {
  await openCase(page, 'forearm');

  // Placed first so the board is proven live before anything is asserted about a tap that
  // should do nothing — otherwise a renderer that never started would pass this test.
  await placeCell(page, 'forearm', 'phago', 2);
  const afterPlacing = FOREARM.startingEnergy - DEFENDERS.phago.cost;

  const nearest = Math.min(
    ...FOREARM.spots.map(([x, y]) => Math.hypot(x - EMPTY_TISSUE[0], y - EMPTY_TISSUE[1])),
  );
  expect(nearest, 'the chosen point is meant to be nowhere near a build spot')
    .toBeGreaterThan(BUILD_SPOT_RADIUS * 2);

  await tapWorld(page, EMPTY_TISSUE[0], EMPTY_TISSUE[1]);
  await expect(onScreen(page, 'energy')).toHaveText(String(afterPlacing));
  await expect(onScreen(page, 'cell-chip-2')).toHaveCount(1);
  await expect(screen(page).locator('[data-testid^="cell-chip-"]')).toHaveCount(1);
});

/**
 * The dearest cell the dock offers on day one, and how many of them the opening balance buys.
 *
 * Both derived, and the count is the part that matters. This was written against the killer cell
 * and a single purchase; the 2026-07-26 tuning raised forearm's opening energy to 260 and made two
 * killer cells affordable, which skipped the test, and deriving the *cell* fixed it only until the
 * next retune raised that energy to 320 and made two of the dearest affordable too. Spending down
 * to wherever the next one stops being affordable is the version that asks the same question at
 * whatever balance a tuning leaves, so there is no third time.
 */
const DEAREST_ON_DAY_ONE = Object.values(DEFENDERS)
  .filter((stats) => stats.unlock === 0)
  .reduce((a, b) => (a.cost >= b.cost ? a : b));

const AFFORDABLE_ON_DAY_ONE = Math.floor(FOREARM.startingEnergy / DEAREST_ON_DAY_ONE.cost);

test('a cell that cannot be afforded is priced red and refuses to be placed', async ({ page }) => {
  // One spot has to be left over to tap, and one cell has to be affordable to spend down from.
  test.skip(
    AFFORDABLE_ON_DAY_ONE < 1 || AFFORDABLE_ON_DAY_ONE >= FOREARM.spots.length,
    `the opening balance buys ${String(AFFORDABLE_ON_DAY_ONE)} of ${String(FOREARM.spots.length)} spots' worth of ${DEAREST_ON_DAY_ONE.label}; retarget this test`,
  );

  const spentOut = FOREARM.startingEnergy - AFFORDABLE_ON_DAY_ONE * DEAREST_ON_DAY_ONE.cost;

  await openCase(page, 'forearm');
  for (let spot = 0; spot < AFFORDABLE_ON_DAY_ONE; spot += 1) {
    await placeCell(page, 'forearm', DEAREST_ON_DAY_ONE.kind, spot);
  }
  await expect(onScreen(page, 'energy')).toHaveText(String(spentOut));
  await expect(onScreen(page, `dock-cost-${DEAREST_ON_DAY_ONE.kind}`))
    .toHaveAttribute('data-affordable', 'false');

  // That cell is still selected and the board is demonstrably live — the placements above went
  // through it — so this tap fails on cost and on nothing else.
  const empty = AFFORDABLE_ON_DAY_ONE;
  await tapSpot(page, 'forearm', empty);
  await expect(onScreen(page, `cell-chip-${String(empty)}`)).toHaveCount(0);
  await expect(onScreen(page, 'energy')).toHaveText(String(spentOut));
});

test('a locked cell shows LOCK and cannot be selected', async ({ page }) => {
  const locked = Object.values(DEFENDERS).find((stats) => stats.unlock > 0);
  test.skip(locked === undefined, 'no defender is gated behind a clear any more');
  if (locked === undefined) return;

  await openCase(page, 'forearm');
  await expect(onScreen(page, `dock-cost-${locked.kind}`)).toHaveText('LOCK');
  await onScreen(page, `dock-card-${locked.kind}`).click();
  await expect(onScreen(page, `dock-card-${locked.kind}`)).toHaveAttribute('aria-pressed', 'false');
});

test('reabsorbing a cell returns part of what it cost', async ({ page }) => {
  await openCase(page, 'forearm');
  await placeCell(page, 'forearm', 'phago', 2);

  const afterPlacing = FOREARM.startingEnergy - DEFENDERS.phago.cost;
  await expect(onScreen(page, 'energy')).toHaveText(String(afterPlacing));

  await onScreen(page, 'cell-chip-2').click();
  const refund = refundOf(DEFENDERS.phago.cost);
  await expect(onScreen(page, 'reabsorb')).toContainText(`+${String(refund)}`);

  await onScreen(page, 'reabsorb').click();
  await expect(onScreen(page, 'energy')).toHaveText(String(afterPlacing + refund));
  await expect(onScreen(page, 'cell-chip-2')).toHaveCount(0);
  await expect(onScreen(page, 'placed-cells')).toContainText('NONE YET');
});

test('maturing a cell charges the growth and renames it', async ({ page }) => {
  const grown = maturedFormOf('phago');
  test.skip(grown === null, 'the phagocyte no longer has a matured form; retarget this test');
  if (grown === null) return;

  await openCase(page, 'forearm');
  await placeCell(page, 'forearm', 'phago', 2);

  const afterPlacing = FOREARM.startingEnergy - DEFENDERS.phago.cost;
  await onScreen(page, 'cell-chip-2').click();
  await expect(onScreen(page, 'mature')).toContainText(grown.name);
  await expect(onScreen(page, 'mature')).toContainText(`−${String(grown.cost)}`);

  // Both sides of the trade, in the real browser. The unit suite proves the wording; what it
  // cannot prove is that the row survives the layout and is on screen next to the price.
  const trade = onScreen(page, 'mature-trade');
  await expect(trade).toBeVisible();
  for (const change of maturedChanges('phago')) {
    await expect(trade).toContainText(`${change.from} → ${change.to}`);
  }

  await onScreen(page, 'mature').click();
  await expect(onScreen(page, 'energy')).toHaveText(String(afterPlacing - grown.cost));
  await expect(onScreen(page, 'cell-chip-2')).toContainText(grown.name);

  // Grown once, and only once — and the refund now reflects everything spent on the cell.
  await expect(onScreen(page, 'mature')).toHaveCount(0);
  await expect(onScreen(page, 'reabsorb'))
    .toContainText(`+${String(refundOf(DEFENDERS.phago.cost + grown.cost))}`);
});
