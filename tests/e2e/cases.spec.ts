import { expect, test } from '@playwright/test';
import { CASES, ruleLabels } from '../../src/game/content/cases';
import { nodeOf } from '../../src/game/front';
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

/**
 * A seeded profile with `cleared` set and `hot` left as the fresh door — which is a fixed seed,
 * but not necessarily the case the previous test cleared — used to say nothing today rather than
 * fail to find one. The day's choices come from the front line now, not from clear order, so a
 * spec that wants a particular case playable has to put the sickness on that case's region
 * itself, not just mark earlier ones cleared.
 */
function profileWith(cleared: readonly CaseId[], hot?: CaseId): Profile {
  const fresh = createFreshProfile();
  return {
    ...fresh,
    cleared,
    front: {
      ...fresh.front,
      infected: hot === undefined ? [] : [nodeOf(hot)],
      held: cleared.map((id) => nodeOf(id)),
    },
  };
}

test('the map offers each case in turn as the ones before it are cleared', async ({ page }) => {
  const cleared: CaseId[] = [];
  for (const definition of CASES) {
    await seedProfile(page, profileWith(cleared, definition.id));
    await expect(screen(page).getByText(definition.title, { exact: true })).toBeVisible();

    await onScreen(page, `pick-${definition.id}`).click();
    await expect(page).toHaveURL(`/brief/${definition.id}`);
    await expect(screen(page).getByText(definition.region, { exact: true })).toBeVisible();

    cleared.push(definition.id);
  }

  await seedProfile(page, profileWith(cleared));
  await expect(onScreen(page, 'held-count')).toHaveText(new RegExp(`^${String(CASES.length)} / `));
  await expect(onScreen(page, 'sleep')).toHaveText('Sleep');
});

/**
 * Reported from review: the fight screen's own header icon left through every phase, including
 * over a result sheet, with a bare route push and nothing else. Leaving through it after the
 * first wave had started cost nothing — a free retry no unit test happened to exercise, because
 * every unit test that reached the header used it before starting a wave. A browser is what
 * proves the whole page, header included, agrees on the rule.
 */
test('leaving through the header after a wave has started still spends the day', async ({ page }) => {
  await seedProfile(page, profileWith([], 'forearm'));
  await onScreen(page, 'pick-forearm').click();
  await onScreen(page, 'get-in-there').click();
  await expect(onScreen(page, 'board-canvas').locator('canvas')).toBeAttached();

  await onScreen(page, 'start-wave').click();
  await expect(onScreen(page, 'start-wave')).toHaveText('Wave in progress');

  await onScreen(page, 'leave').click();
  await expect(page).toHaveURL('/');
  await expect(screen(page).getByText('DAY 2 · MORNING', { exact: true })).toBeVisible();
});

/**
 * Reported from re-review: the map stopped offering the day's choices once the run was lost, but
 * nothing at the route level asked the same question. A player whose body was gone could still
 * reach a fight through browser Back to a brief visited earlier, or by typing either URL directly.
 * Driven the way a player actually would — a fresh navigation to the URL, not a client-side push —
 * because that is exactly what typing a URL or restoring a bookmark does, and what the earlier
 * hole let through.
 */
test('a lost run cannot be reached by URL — the brief and the fight both send it back to the map', async ({ page }) => {
  const fresh = createFreshProfile();
  const lost: Profile = { ...fresh, front: { ...fresh.front, infected: ['heart'] } };
  await seedProfile(page, lost);

  await page.goto('/play/forearm');
  await expect(page).toHaveURL('/');
  await expect(onScreen(page, 'run-lost')).toBeVisible();

  await page.goto('/brief/forearm');
  await expect(page).toHaveURL('/');
  await expect(onScreen(page, 'run-lost')).toBeVisible();
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
      .toContainText(ruleLabels(definition).toUpperCase());
    await expect(onScreen(page, 'board-hint')).toContainText(/INCOMING|IN THE VESSEL/);
  });
}
