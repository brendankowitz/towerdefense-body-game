import { expect, test } from '@playwright/test';
import { openCase } from './helpers';

/**
 * 44 CSS pixels is the minimum comfortable tap target on a phone (Apple HIG, WCAG 2.5.5).
 *
 * This is a layout assertion and it needs a real browser: jsdom has no layout, so every unit
 * test in the suite reports a height of zero and cannot see this class of defect. It exists
 * because the brief's call to action shipped at 17px — `flex: 1` fills the width in the map's
 * row of actions and governs the height in a column footer, and nothing caught it until the
 * game was played.
 */
const MIN_TAP_TARGET = 44;

/**
 * Ionic keeps the page you came from mounted behind the one you are on, and its controls
 * collapse rather than unmount — so a bare `button` selector picks up 1px ghosts from the
 * previous screen. Only the page actually on top counts.
 */
const VISIBLE_BUTTON = '.ion-page:not(.ion-page-hidden) button';

const SCREENS: readonly (readonly [string, string])[] = [
  ['the map', '/'],
  ['the brief', '/brief/forearm'],
  ['immunity', '/immunity'],
  ['the season', '/season'],
];

for (const [name, path] of SCREENS) {
  test(`every control on ${name} is big enough to tap`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator(VISIBLE_BUTTON).first()).toBeVisible();

    const undersized = await page.locator(VISIBLE_BUTTON).evaluateAll(
      (nodes, min) => nodes
        .map((node) => ({ node, box: node.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 || box.height > 0)
        .filter(({ box }) => box.height < min)
        .map(({ node, box }) => `${node.textContent.trim().slice(0, 24)} — ${String(Math.round(box.height))}px`),
      MIN_TAP_TARGET,
    );

    expect(undersized, `controls under ${String(MIN_TAP_TARGET)}px tall`).toEqual([]);
  });
}

test('every control on the fight screen is big enough to tap', async ({ page }) => {
  await openCase(page, 'forearm');

  const undersized = await page.locator(VISIBLE_BUTTON).evaluateAll(
    (nodes, min) => nodes
      .map((node) => ({ node, box: node.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 || box.height > 0)
      .filter(({ box }) => box.height < min)
      .map(({ node, box }) => `${node.textContent.trim().slice(0, 24)} — ${String(Math.round(box.height))}px`),
    MIN_TAP_TARGET,
  );

  expect(undersized, `controls under ${String(MIN_TAP_TARGET)}px tall`).toEqual([]);
});
