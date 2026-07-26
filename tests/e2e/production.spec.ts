import { expect, test } from '@playwright/test';
import { onScreen, openCase } from './helpers';

/**
 * Spec §13.10 — the tuning panel is absent from the production bundle.
 *
 * CI already greps `dist/` for `applyDefenderTuning`. This is the other half of the same
 * claim, from the player's side: on the built application the fight screen comes up fully
 * live and the panel is neither in the document nor fetched. The request assertion is what
 * makes the test hard to satisfy by accident — a page that failed to load would have no
 * tuning handle either, but it would also have no dock, no energy and no board.
 */
test('the built fight screen is live and carries no tuning panel', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => { requested.push(request.url()); });

  await openCase(page, 'forearm');
  await expect(onScreen(page, 'energy')).toBeVisible();
  await expect(onScreen(page, 'dock-card-phago')).toBeVisible();
  await expect(onScreen(page, 'start-wave')).toHaveText('Start wave 1');

  await expect(onScreen(page, 'tuning-handle')).toHaveCount(0);
  await expect(onScreen(page, 'tuning-panel')).toHaveCount(0);
  expect(requested.filter((url) => /tuning/i.test(url))).toEqual([]);
});
