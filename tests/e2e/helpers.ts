import { expect, type Locator, type Page } from '@playwright/test';
import { CASE_BY_ID } from '../../src/game/content/cases';
import { BOARD_HEIGHT, BOARD_WIDTH } from '../../src/game/content/rules';
import type { CaseId, DefenderKind } from '../../src/game/types';
import type { Profile } from '../../src/game/progression';
import { STORAGE_KEY, encode } from '../../src/progress/ProgressRepository';

// Content is imported rather than restated so a tuning pass moves the suite with it. The
// imports are relative because Playwright's transpiler resolves the file system, not the
// `@game/*` aliases the application builds with.

/**
 * The one route that is actually on screen.
 *
 * `IonRouterOutlet` keeps every visited route mounted. The page being left keeps its box for
 * the length of the transition and is only marked `ion-page-invisible` — which is opacity, not
 * display, so Playwright still counts it visible. Excluding both marker classes leaves exactly
 * the settled page, and every locator is scoped through here so an assertion can never be
 * satisfied by a stale copy of a screen the player has already left.
 */
export function screen(page: Page): Locator {
  return page.locator('ion-router-outlet .ion-page:not(.ion-page-hidden):not(.ion-page-invisible)');
}

export function onScreen(page: Page, testId: string): Locator {
  return screen(page).getByTestId(testId);
}

/**
 * Opens a case and waits for the board to exist. Pixi's `Application.init` is async, so the
 * canvas is the first observable proof that the renderer got as far as mounting.
 */
export async function openCase(page: Page, caseId: CaseId): Promise<void> {
  await page.goto(`/play/${caseId}`);
  await expect(onScreen(page, 'board-canvas').locator('canvas')).toBeAttached();
}

/**
 * World to screen, using the same CONTAIN fit as `fitViewport` — `Math.min`, letterboxed and
 * centred. Restated rather than imported: `src/render/viewport.ts` is the renderer's own copy
 * and this is the test's independent statement of the same contract. If the two ever diverge
 * every tap lands on empty tissue and this suite says so loudly.
 */
export async function tapWorld(page: Page, worldX: number, worldY: number): Promise<void> {
  const box = await onScreen(page, 'board-canvas').boundingBox();
  if (box === null) throw new Error('The board has no layout box');

  const scale = Math.min(box.width / BOARD_WIDTH, box.height / BOARD_HEIGHT);
  const offsetX = (box.width - BOARD_WIDTH * scale) / 2;
  const offsetY = (box.height - BOARD_HEIGHT * scale) / 2;

  await page.mouse.click(box.x + offsetX + worldX * scale, box.y + offsetY + worldY * scale);
}

export async function tapSpot(page: Page, caseId: CaseId, spotIndex: number): Promise<void> {
  const spot = CASE_BY_ID[caseId].spots[spotIndex];
  if (spot === undefined) throw new Error(`Case ${caseId} has no build spot ${String(spotIndex)}`);
  await tapWorld(page, spot[0], spot[1]);
}

/** Selects a dock card, tolerating the phagocyte already being selected on a fresh board. */
export async function chooseCell(page: Page, kind: DefenderKind): Promise<void> {
  const card = onScreen(page, `dock-card-${kind}`);
  await expect(card).toBeVisible();
  if ((await card.getAttribute('aria-pressed')) !== 'true') await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
}

/**
 * Places a cell and does not return until the board agrees it is there.
 *
 * The tap is retried rather than fired once because `BoardCanvas` ignores pointers until its
 * renderer has been committed to React state, and nothing in the DOM marks that moment. A
 * repeat tap on an occupied spot is refused by `placeDefender`, so retrying cannot overspend.
 */
export async function placeCell(
  page: Page, caseId: CaseId, kind: DefenderKind, spotIndex: number,
): Promise<void> {
  await chooseCell(page, kind);
  const chip = onScreen(page, `cell-chip-${String(spotIndex)}`);
  await expect(async () => {
    await tapSpot(page, caseId, spotIndex);
    await expect(chip).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 20_000 });
}

/** Writes a saved run the way the application would have, then loads the app against it. */
export async function seedProfile(page: Page, profile: Profile): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ({ key, value }: { key: string; value: string }) => { window.localStorage.setItem(key, value); },
    { key: STORAGE_KEY, value: encode(profile) },
  );
  await page.reload();
}
