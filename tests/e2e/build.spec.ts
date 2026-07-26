import { expect, test } from '@playwright/test';
import { CASE_BY_ID } from '../../src/game/content/cases';
import { DEFENDERS, DEFENDER_BLURBS } from '../../src/game/content/defenders';
import { maturedFormOf } from '../../src/game/content/maturation';
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

test('a cell that cannot be afforded is priced red and refuses to be placed', async ({ page }) => {
  const afterOne = FOREARM.startingEnergy - DEFENDERS.nk.cost;
  test.skip(afterOne >= DEFENDERS.nk.cost, 'a retune made two killer cells affordable; retarget this test');

  await openCase(page, 'forearm');
  await placeCell(page, 'forearm', 'nk', 1);
  await expect(onScreen(page, 'energy')).toHaveText(String(afterOne));
  await expect(onScreen(page, 'dock-cost-nk')).toHaveAttribute('data-affordable', 'false');

  // The killer cell is still selected and the board is demonstrably live — the placement
  // above went through it — so this tap fails on cost and on nothing else.
  await tapSpot(page, 'forearm', 3);
  await expect(onScreen(page, 'cell-chip-3')).toHaveCount(0);
  await expect(onScreen(page, 'energy')).toHaveText(String(afterOne));
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

  await onScreen(page, 'mature').click();
  await expect(onScreen(page, 'energy')).toHaveText(String(afterPlacing - grown.cost));
  await expect(onScreen(page, 'cell-chip-2')).toContainText(grown.name);

  // Grown once, and only once — and the refund now reflects everything spent on the cell.
  await expect(onScreen(page, 'mature')).toHaveCount(0);
  await expect(onScreen(page, 'reabsorb'))
    .toContainText(`+${String(refundOf(DEFENDERS.phago.cost + grown.cost))}`);
});
