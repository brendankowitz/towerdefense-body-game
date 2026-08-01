import { expect, test } from '@playwright/test';
import { BODY_NODES } from '../../src/game/content/body';
import { FRESH_PROFILE, IMMUNITY_MAX } from '../../src/game/content/rules';
import { createFront, holdRegion, nodeOf } from '../../src/game/front';
import { createFreshProfile, type Profile } from '../../src/game/progression';
import { STORAGE_KEY, STORAGE_VERSION } from '../../src/progress/ProgressRepository';
import { onScreen, screen, seedProfile } from './helpers';

// The day a fresh body opens on — `front.day`, the only day a profile has. Read off
// `createFreshProfile()` rather than a rules constant, so this follows the actual mechanism
// that decides it rather than a number that happens to agree with it.
const FRESH_DAY = createFreshProfile().front.day;

/**
 * Spec §13.7 — progress survives a reload, and a save that cannot be read yields a fresh
 * profile rather than a crash.
 *
 * This is the one thing the unit suites cannot show. `LocalStorageProgressRepository` is
 * tested against a stub, and `ProfileProvider` against a fake repository; only a real browser
 * reload crosses the actual storage boundary with the real serialiser on both sides.
 *
 * Note what is deliberately *not* done here: the saved run is never re-seeded by an init
 * script. An init script runs again on every navigation, including `reload()`, which would
 * rewrite the very value the reload is supposed to be proving survived — the test would pass
 * whether or not anything was ever written.
 */

// The regions a season can hold: not the core, and not the joints the body only routes
// through. Counted from `BODY_NODES` rather than read off `CASE_REGIONS`, which is what the
// page uses — reading the same list would make this follow the code it is meant to hold.
const REGION_COUNT = BODY_NODES
  .filter((node) => node.core !== true && node.connective !== true).length;

const FRONT_WITH_FOREARM_HELD = holdRegion(createFront(FRESH_PROFILE.seed), nodeOf('forearm'));

const SAVED: Profile = {
  cleared: ['forearm'],
  immunity: { staph: 1, film: 0, virus: 0 },
  bank: 420,
  kills: 37,
  front: { ...FRONT_WITH_FOREARM_HELD, day: 2 },
};

test('a saved run is read back, and a run written through the UI outlives a reload', async ({ page }) => {
  await seedProfile(page, SAVED);

  await expect(onScreen(page, 'bank')).toHaveText(String(SAVED.bank));
  await expect(onScreen(page, 'held-count')).toHaveText(`1 / ${String(REGION_COUNT)}`);

  await page.goto('/immunity');
  await expect(onScreen(page, 'stat-days')).toHaveText(String(SAVED.front.day));
  await expect(onScreen(page, 'stat-kills')).toHaveText(String(SAVED.kills));
  await expect(onScreen(page, 'stat-regions')).toHaveText('1');
  await expect(onScreen(page, 'strain-staph')).toContainText(`1/${String(IMMUNITY_MAX)}`);

  await page.reload();
  await expect(onScreen(page, 'stat-days')).toHaveText(String(SAVED.front.day));
  await expect(onScreen(page, 'strain-staph')).toContainText(`1/${String(IMMUNITY_MAX)}`);

  // "Start a new body" is a real write down the same path a cleared case takes. Nothing puts
  // the old run back, so if the write never reached storage the reload below restores day 2.
  await onScreen(page, 'reset-run').click();
  await expect(page).toHaveURL('/');
  await expect(onScreen(page, 'bank')).toHaveText(String(FRESH_PROFILE.bank));

  await page.reload();
  await expect(onScreen(page, 'bank')).toHaveText(String(FRESH_PROFILE.bank));
  await expect(onScreen(page, 'held-count')).toHaveText(`0 / ${String(REGION_COUNT)}`);

  await page.goto('/immunity');
  await expect(onScreen(page, 'stat-days')).toHaveText(String(FRESH_DAY));
  await expect(onScreen(page, 'stat-kills')).toHaveText('0');
  await expect(onScreen(page, 'strain-staph')).toContainText(`0/${String(IMMUNITY_MAX)}`);
});

const UNREADABLE: readonly (readonly [string, string])[] = [
  ['not JSON at all', '{not json'],
  ['an envelope from a future version', JSON.stringify({ version: STORAGE_VERSION + 1, profile: {} })],
  ['a profile of the wrong shape', JSON.stringify({ version: STORAGE_VERSION, profile: { cleared: 'forearm' } })],
  ['an out-of-range immunity count', JSON.stringify({
    version: STORAGE_VERSION,
    profile: { cleared: [], immunity: { staph: 99, film: 0, virus: 0 }, day: 1, bank: 0, kills: 0 },
  })],
];

for (const [description, raw] of UNREADABLE) {
  test(`a save that is ${description} yields a fresh body rather than a crash`, async ({ page }) => {
    const failures: string[] = [];
    page.on('pageerror', (error) => { failures.push(error.message); });

    await page.addInitScript(
      ({ key, value }: { key: string; value: string }) => { window.localStorage.setItem(key, value); },
      { key: STORAGE_KEY, value: raw },
    );

    await page.goto('/');
    await expect(screen(page).getByText(`DAY ${String(FRESH_DAY)} · MORNING`)).toBeVisible();
    await expect(onScreen(page, 'bank')).toHaveText(String(FRESH_PROFILE.bank));
    await expect(onScreen(page, 'held-count')).toHaveText(`0 / ${String(REGION_COUNT)}`);
    expect(failures).toEqual([]);
  });
}
