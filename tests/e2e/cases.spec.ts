import { expect, test } from '@playwright/test';
import { CASES } from '../../src/game/content/cases';
import { createFreshProfile, type Profile } from '../../src/game/progression';
import type { CaseId } from '../../src/game/types';
import { onScreen, openCase, placeCell, screen, seedProfile } from './helpers';

/**
 * Spec §13.1 — every case is playable, and progression opens them in order.
 *
 * Playable here means the mechanics of a run work in a real browser: the case loads, a cell
 * can be placed on its board, the wave starts and the simulation is running. Whether a
 * particular build survives a particular wave is balance, and belongs to `wave.spec.ts` and
 * nowhere else.
 */

function profileWith(cleared: readonly CaseId[]): Profile {
  return { ...createFreshProfile(), cleared };
}

test('the map offers each case in turn as the ones before it are cleared', async ({ page }) => {
  const cleared: CaseId[] = [];
  for (const definition of CASES) {
    await seedProfile(page, profileWith(cleared));
    await expect(screen(page).getByText(definition.title, { exact: true })).toBeVisible();

    await onScreen(page, 'go-there').click();
    await expect(page).toHaveURL(`/brief/${definition.id}`);
    await expect(screen(page).getByText(definition.region, { exact: true })).toBeVisible();

    cleared.push(definition.id);
  }

  await seedProfile(page, profileWith(cleared));
  await expect(onScreen(page, 'held-count')).toHaveText(new RegExp(`^${String(CASES.length)} / `));
  await expect(onScreen(page, 'go-there')).toHaveText('Sleep');
});

for (const definition of CASES) {
  test(`${definition.id}: a cell can be placed and its wave started`, async ({ page }) => {
    await openCase(page, definition.id);
    await expect(onScreen(page, 'energy')).toHaveText(String(definition.startingEnergy));
    await expect(onScreen(page, 'fight-wave'))
      .toHaveText(`Wave 1 of ${String(definition.waves.length)}`);

    await placeCell(page, definition.id, 'phago', 1);
    await expect(onScreen(page, 'start-wave')).toHaveText('Start wave 1');

    await onScreen(page, 'start-wave').click();
    await expect(onScreen(page, 'start-wave')).toHaveText('Wave in progress');
    await expect(onScreen(page, 'start-wave')).toHaveAttribute('data-enabled', 'false');
    await expect(onScreen(page, 'board-modifier'))
      .toContainText(definition.ruleLabel.toUpperCase());
    await expect(onScreen(page, 'board-hint')).toContainText(/INCOMING|IN THE VESSEL/);
  });
}
