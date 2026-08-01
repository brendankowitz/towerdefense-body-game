import { expect, test } from '@playwright/test';
import { CASE_BY_ID, ruleLabels } from '../../src/game/content/cases';
import { BODY_NODES } from '../../src/game/content/body';
import { FRESH_PROFILE } from '../../src/game/content/rules';
import { STRAIN_ROWS, VACCINES } from '../../src/game/content/vaccines';
import { nodeOf } from '../../src/game/front';
import { createFreshProfile, type Profile } from '../../src/game/progression';
import { onScreen, screen, seedProfile } from './helpers';

/**
 * Spec §13.9 — the five screens exist, render their own content and reach each other.
 *
 * Nothing here asserts a colour or a duration: the palette and motion rules are a design
 * review, and the copy rules already have mechanical tests. What a browser can prove that a
 * jsdom render cannot is that the five lazy route chunks resolve in the built bundle and that
 * the router hands off between them.
 */

const FOREARM = CASE_BY_ID.forearm;
// The regions a season can hold: not the core, and not the joints the body only routes
// through. Counted from `BODY_NODES` rather than read off `CASE_REGIONS`, which is what the
// page uses — reading the same list would make this follow the code it is meant to hold.
const REGION_COUNT = BODY_NODES
  .filter((node) => node.core !== true && node.connective !== true).length;

/**
 * The day's choices come from the front line, not clear order, so a chain that means to walk
 * through the forearm case has to put the sickness there itself rather than trust a fresh
 * body's door to be it.
 */
function profileWithForearmHot(): Profile {
  const fresh = createFreshProfile();
  return { ...fresh, front: { ...fresh.front, infected: [nodeOf(FOREARM.id)] } };
}

test('the map, the brief and the fight screen chain together', async ({ page }) => {
  await seedProfile(page, profileWithForearmHot());
  await expect(screen(page).getByText('The body', { exact: true })).toBeVisible();
  await expect(onScreen(page, 'bank')).toHaveText(String(FRESH_PROFILE.bank));
  await expect(onScreen(page, 'held-count')).toHaveText(`0 / ${String(REGION_COUNT)}`);
  await expect(screen(page).getByText(FOREARM.title, { exact: true })).toBeVisible();

  await onScreen(page, `pick-${FOREARM.id}`).click();
  await expect(page).toHaveURL(`/brief/${FOREARM.id}`);
  await expect(screen(page).getByText(FOREARM.region, { exact: true })).toBeVisible();
  await expect(screen(page).getByText(FOREARM.story, { exact: true })).toBeVisible();
  await expect(onScreen(page, 'brief-enemy').first()).toBeVisible();
  await expect(onScreen(page, 'brief-shield')).toContainText('0 of 3 clears done');

  await onScreen(page, 'get-in-there').click();
  await expect(page).toHaveURL(`/play/${FOREARM.id}`);
  await expect(onScreen(page, 'fight-region'))
    .toHaveText(`FOREARM · ${ruleLabels(FOREARM).toUpperCase()}`);
  await expect(onScreen(page, 'fight-wave'))
    .toHaveText(`Wave 1 of ${String(FOREARM.waves.length)}`);
  await expect(onScreen(page, 'board-canvas').locator('canvas')).toBeAttached();

  await onScreen(page, 'leave').click();
  await expect(page).toHaveURL('/');
  await expect(onScreen(page, 'bank')).toHaveText(String(FRESH_PROFILE.bank));
});

test('the season and immunity screens reach each other and the map', async ({ page }) => {
  await page.goto('/');
  await screen(page).getByRole('button', { name: 'Season' }).click();
  await expect(page).toHaveURL('/season');
  await expect(onScreen(page, 'vaccine-row')).toHaveCount(VACCINES.length);
  await expect(onScreen(page, 'season-row').first()).toBeVisible();

  await screen(page).getByRole('button', { name: "What I'm immune to" }).click();
  await expect(page).toHaveURL('/immunity');
  await expect(onScreen(page, 'stat-days')).toHaveText(String(createFreshProfile().front.day));
  await expect(onScreen(page, 'stat-kills')).toHaveText('0');
  await expect(onScreen(page, 'stat-regions')).toHaveText('0');
  for (const row of STRAIN_ROWS) {
    await expect(onScreen(page, `strain-${row.key}`)).toContainText('0/3');
  }

  await screen(page).getByRole('button', { name: 'Season & vaccines' }).click();
  await expect(page).toHaveURL('/season');

  await screen(page).getByRole('button', { name: 'Back to the body' }).click();
  await expect(page).toHaveURL('/');
  await expect(screen(page).getByText('The body', { exact: true })).toBeVisible();
});

test('an unknown route falls back to the map', async ({ page }) => {
  await page.goto('/play/spleen');
  await expect(page).toHaveURL('/');
  await expect(screen(page).getByText('The body', { exact: true })).toBeVisible();
});
