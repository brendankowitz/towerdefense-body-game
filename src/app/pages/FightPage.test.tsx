import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, useLocation } from 'react-router-dom';
import { CASE_BY_ID, ruleLabels } from '@game/content/cases';
import { DEFENDERS, DEFENDER_ORDER } from '@game/content/defenders';
import { endDay as gameEndDay } from '@game/front';
import { clearCase, createFreshProfile, type Profile } from '@game/progression';
import { FEVER_DURATION, TISSUE_PIPS } from '@game/content/rules';
import type { SimState } from '@game/types';
import { STORAGE_KEY } from '@progress/ProgressRepository';
import { ProfileProvider } from '@app/state/ProfileProvider';
import { FightPage } from './FightPage';

/**
 * Pixi needs a GPU context jsdom does not have, and the board is not what these tests are
 * about. Only the renderer is replaced: `BoardCanvas`, `screenToWorld` and `hitBuildSpot`
 * are the real ones, so a tap here really does go through the board's hit testing.
 */
const viewport = { scale: 1, offsetX: 0, offsetY: 0 };

vi.mock('@render/BoardRenderer', () => ({
  BoardRenderer: {
    create: () => Promise.resolve({
      viewport,
      draw: () => undefined,
      resize: () => undefined,
      destroy: () => undefined,
    }),
  },
}));

/**
 * The only way to reach a case-clear result is to defeat every wave, which would make the
 * outcome a balance assertion in disguise (Global Constraints). Instead the real simulation
 * state is captured as it is built, and the one test that needs a "case cleared" result sets
 * it by construction rather than by out-damaging the content.
 */
const captured = vi.hoisted(() => ({ state: undefined as SimState | undefined }));

vi.mock('@game/state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@game/state')>();
  return {
    ...actual,
    createSimState: (input: Parameters<typeof actual.createSimState>[0]): SimState => {
      captured.state = actual.createSimState(input);
      return captured.state;
    },
  };
});

const CASE = CASE_BY_ID.forearm;
const PROFILE = createFreshProfile();

/** Hand-driven animation frames, so a test decides how much time passes. */
const frames: ((timestamp: number) => void)[] = [];

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

/** Renders and lets the profile load and the board's asynchronous start settle. */
async function renderFight(path = `/play/${CASE.id}`): Promise<void> {
  render(
    <ProfileProvider>
      <MemoryRouter initialEntries={[path]}>
        <Route exact path="/play/:caseId" component={FightPage} />
        <Route component={LocationProbe} />
      </MemoryRouter>
    </ProfileProvider>,
  );
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

/** What `ProfileProvider` actually wrote, read back the way the app itself would on reload. */
function persistedProfile(): Profile {
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as { profile?: Profile };
  if (stored.profile === undefined) throw new Error('no profile was persisted');
  return stored.profile;
}

/** Runs a case to a loss with nothing built, takes the result's only action, and settles. */
async function renderFightLost(): Promise<{ readonly profile: Profile }> {
  await renderFight();
  act(() => { screen.getByTestId('start-wave').click(); });

  // The frame budget bounds the wait: a hang here should fail, not stall the suite.
  let seconds = 0;
  for (let frame = 0; frame < 4000 && screen.queryByTestId('result-cta') === null; frame += 1) {
    seconds += 1 / 30;
    tickFrame(seconds);
  }
  const cta = screen.queryByTestId('result-cta');
  if (cta === null) throw new Error('the case was expected to be lost with nothing built');

  act(() => { cta.click(); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return { profile: persistedProfile() };
}

/** Forces a case win by construction (see `captured` above) and takes the result's action. */
async function renderFightCleared(): Promise<{ readonly profile: Profile }> {
  await renderFight();
  if (captured.state === undefined) throw new Error('createSimState was never called');
  captured.state.totalKills = 1;
  captured.state.result = 'case';
  // Two frames: the first only establishes the previous timestamp (elapsed is always zero on
  // it), the second supplies the elapsed time the HUD publish timer needs to fire.
  tickFrame(0);
  tickFrame(0.2);

  act(() => { screen.getByTestId('result-cta').click(); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return { profile: persistedProfile() };
}

function board(): HTMLElement {
  return screen.getByTestId('board-canvas');
}

function tickFrame(seconds: number): void {
  const due = frames.splice(0, frames.length);
  act(() => {
    for (const callback of due) callback(seconds * 1000);
  });
}

function energy(): number {
  return Number(screen.getByTestId('energy').textContent);
}

function tapSpot(host: HTMLElement, spotIndex: number): void {
  const spot = CASE.spots[spotIndex];
  if (spot === undefined) throw new Error(`case ${CASE.id} has no spot ${String(spotIndex)}`);
  // Identity viewport and jsdom's zero-origin bounding box make client == world here.
  act(() => {
    host.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true, clientX: spot[0], clientY: spot[1],
    }));
  });
}

function tapEmptyBoard(host: HTMLElement): void {
  act(() => {
    host.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
  });
}

beforeEach(() => {
  localStorage.clear();
  captured.state = undefined;
  frames.length = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: (timestamp: number) => void): number => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
  vi.stubGlobal('ResizeObserver', class {
    observe(): void { /* the board never resizes under test */ }
    unobserve(): void { /* no-op */ }
    disconnect(): void { /* no-op */ }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FightPage', () => {
  it('sends an unknown case back to the body rather than showing an empty board', async () => {
    await renderFight('/play/not-a-case');
    expect(screen.getByTestId('location').textContent).toBe('/');
  });

  it('names the region and the rule the case is fought under', async () => {
    await renderFight();
    const region = CASE.region.split(' · ')[0] ?? '';
    expect(screen.getByTestId('fight-region').textContent)
      .toBe(`${region} · ${ruleLabels(CASE).toUpperCase()}`);
  });

  it('counts the wave against the number of waves the case defines', async () => {
    await renderFight();
    expect(screen.getByTestId('fight-wave').textContent)
      .toBe(`Wave 1 of ${String(CASE.waves.length)}`);
  });

  it('opens with the case energy the content gives it', async () => {
    await renderFight();
    expect(energy()).toBe(CASE.startingEnergy);
  });

  it('changes the board hint when a cell is picked up and put back down', async () => {
    await renderFight();
    expect(screen.getByTestId('board-hint').textContent).toBe('TAP A JUNCTION TO PLACE');

    // The dock opens on a default selection, so the first tap on it clears the selection.
    act(() => { screen.getByTestId('dock-card-phago').click(); });
    expect(screen.getByTestId('board-hint').textContent).toBe('PICK A CELL BELOW');

    act(() => { screen.getByTestId('dock-card-clot').click(); });
    expect(screen.getByTestId('board-hint').textContent).toBe('TAP A JUNCTION TO PLACE');
  });

  it('spends exactly the cost of the selected cell when a junction is tapped', async () => {
    await renderFight();
    const host = board();

    act(() => { screen.getByTestId('dock-card-clot').click(); });
    const before = energy();
    tapSpot(host, 0);

    expect(energy()).toBe(before - DEFENDERS.clot.cost);
  });

  /**
   * Reported from play: the reabsorb and grow actions were only reachable from the chip row, so
   * tapping the cell you wanted to change — the gesture anyone reaches for first — did nothing.
   */
  it('opens a placed cell for reabsorbing or growing when it is tapped on the board', async () => {
    await renderFight();
    const host = board();

    // Not the dock's default pick: clicking that card would toggle the selection off.
    act(() => { screen.getByTestId('dock-card-clot').click(); });
    tapSpot(host, 0);
    expect(screen.getByTestId('cell-chip-0')).toBeInTheDocument();
    expect(screen.queryByTestId('reabsorb')).not.toBeInTheDocument();

    tapSpot(host, 0);
    expect(screen.getByTestId('reabsorb')).toBeInTheDocument();

    // Tapping it again closes it, so the gesture is a toggle rather than a one-way door.
    tapSpot(host, 0);
    expect(screen.queryByTestId('reabsorb')).not.toBeInTheDocument();
  });

  it('spends nothing for a tap that lands on no junction', async () => {
    await renderFight();
    const host = board();
    const before = energy();

    tapEmptyBoard(host);

    expect(energy()).toBe(before);
  });

  it('spends nothing for a second cell on a junction that is already taken', async () => {
    await renderFight();
    const host = board();

    tapSpot(host, 1);
    const afterFirst = energy();
    tapSpot(host, 1);

    expect(energy()).toBe(afterFirst);
    expect(afterFirst).toBe(CASE.startingEnergy - DEFENDERS.phago.cost);
  });

  it('cannot place a cell the profile has not unlocked', async () => {
    await renderFight();
    const locked = screen.getByTestId('dock-card-mem');
    expect(locked).toHaveAttribute('data-locked', 'true');
    expect(DEFENDERS.mem.unlock).toBeGreaterThan(PROFILE.cleared.length);

    act(() => { locked.click(); });
    expect(screen.getByTestId('dock-card-mem')).toHaveAttribute('aria-pressed', 'false');
  });

  /**
   * Build and fight are meant to be separate decisions. The dock going dead is the visible half;
   * the tap being refused with a cell still in hand is the half that matters, so the selection is
   * put back on the state directly rather than through the dock the test has just proved is dead.
   */
  it('builds nothing once the wave is running', async () => {
    await renderFight();
    if (captured.state === undefined) throw new Error('createSimState was never called');
    const host = board();

    act(() => { screen.getByTestId('start-wave').click(); });

    const banked = energy();
    expect(banked, 'the refusal has to be about the phase, not the price')
      .toBeGreaterThanOrEqual(DEFENDERS.clot.cost);
    for (const kind of DEFENDER_ORDER) {
      expect(screen.getByTestId(`dock-card-${kind}`), kind).toBeDisabled();
    }

    captured.state.selected = 'clot';
    tapSpot(host, 0);

    expect(energy()).toBe(banked);
    expect(captured.state.towers).toHaveLength(0);
  });

  it('shows the case rule on the board only while a wave is running', async () => {
    await renderFight();
    expect(screen.queryByTestId('board-modifier')).not.toBeInTheDocument();

    act(() => { screen.getByTestId('start-wave').click(); });

    const modifier = screen.getByTestId('board-modifier');
    expect(modifier.textContent).toBe(ruleLabels(CASE).toUpperCase());
    expect(modifier.querySelectorAll('.pulse')).toHaveLength(1);
  });

  it('stops offering the start control once the wave is running', async () => {
    await renderFight();
    const start = screen.getByTestId('start-wave');
    expect(start.textContent).toBe('Start wave 1');
    expect(start).toHaveAttribute('data-enabled', 'true');

    act(() => { start.click(); });

    expect(screen.getByTestId('start-wave').textContent).toBe('Wave in progress');
    expect(screen.getByTestId('start-wave')).toHaveAttribute('data-enabled', 'false');
  });

  it('cannot restart a wave that is already running', async () => {
    await renderFight();
    act(() => { screen.getByTestId('start-wave').click(); });
    act(() => { screen.getByTestId('fever').click(); });
    expect(screen.getByTestId('fever-label').textContent).toBe(`${String(FEVER_DURATION)}S`);

    // Starting a wave gives the fever back, so a fever still spent is proof nothing restarted.
    act(() => { screen.getByTestId('start-wave').click(); });

    expect(screen.getByTestId('fever-label').textContent).toBe(`${String(FEVER_DURATION)}S`);
    expect(screen.getByTestId('fever')).toHaveAttribute('data-available', 'false');
  });

  it('offers fever only during a wave, and only once', async () => {
    await renderFight();
    expect(screen.getByTestId('fever')).toHaveAttribute('data-available', 'false');

    act(() => { screen.getByTestId('start-wave').click(); });
    expect(screen.getByTestId('fever')).toHaveAttribute('data-available', 'true');

    act(() => { screen.getByTestId('fever').click(); });
    expect(screen.getByTestId('fever')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('fever')).toHaveAttribute('data-available', 'false');
  });

  it('does not spend fever outside a wave', async () => {
    await renderFight();
    act(() => { screen.getByTestId('fever').click(); });
    expect(screen.getByTestId('fever-label').textContent).toBe('1 USE');
  });

  it('toggles the pace', async () => {
    await renderFight();
    expect(screen.getByTestId('speed').textContent).toBe('1×');

    act(() => { screen.getByTestId('speed').click(); });
    expect(screen.getByTestId('speed').textContent).toBe('2×');

    act(() => { screen.getByTestId('speed').click(); });
    expect(screen.getByTestId('speed').textContent).toBe('1×');
  });

  it('leaves the region for free when the header control is used before the fight begins', async () => {
    await renderFight();
    act(() => { screen.getByTestId('leave').click(); });
    expect(screen.getByTestId('location').textContent).toBe('/');
    // Nothing was read, nothing was fought — nothing should have been written either.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  /**
   * Reported from review: the header's own leave icon rendered through every phase, including
   * over a result sheet, and its handler was a bare route push — no day, no `endDay`, nothing.
   * Losing and tapping it instead of the sheet's own button was a completely free retry; winning
   * and tapping it threw the clear away along with the reward and the held region. The rule is
   * that a day is spent once the fight has begun, and it has to hold everywhere off this screen,
   * not just through the sheet.
   */
  it('spends the day when the header control is used after the first wave has started', async () => {
    await renderFight();
    act(() => { screen.getByTestId('start-wave').click(); });
    act(() => { screen.getByTestId('leave').click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(screen.getByTestId('location').textContent).toBe('/');
    expect(persistedProfile().front.day).toBe(2);
  });

  /**
   * The other half of the same finding: once a result is showing, the header icon must not be a
   * second, cheaper way off the page beside the sheet's own buttons — especially not on a win,
   * where a bare route push would silently discard the clear, the reward and the held region.
   */
  it('hides the header leave control once a result is on screen', async () => {
    await renderFight();
    if (captured.state === undefined) throw new Error('createSimState was never called');
    captured.state.totalKills = 1;
    captured.state.result = 'case';
    tickFrame(0);
    tickFrame(0.2);

    expect(screen.queryByTestId('leave')).not.toBeInTheDocument();
  });

  /**
   * The rule reaches a held-but-unfinished wave too: the "Leave the region" button on a `'wave'`
   * result is reached only after the first wave was already fought and held, so the player has
   * committed exactly as much as a loss did, and walking away from here costs the same day.
   */
  it('spends the day when the result sheet\'s own leave control is used after a wave is held', async () => {
    await renderFight();
    if (captured.state === undefined) throw new Error('createSimState was never called');
    captured.state.phase = 'built';
    captured.state.result = 'wave';
    tickFrame(0);
    tickFrame(0.2);

    act(() => { screen.getByTestId('result-leave').click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(screen.getByTestId('location').textContent).toBe('/');
    expect(persistedProfile().front.day).toBe(2);
  });

  it('states the loss and offers the case again when every pathogen walks through', async () => {
    // Not a balance assertion: with nothing built, nothing can kill anything, so every
    // pathogen in the wave reaches the end and each one costs a pip.
    const firstWave = CASE.waves[0] ?? [];
    const bodies = firstWave.reduce((total, entry) => total + entry.count, 0);
    expect(bodies).toBeGreaterThanOrEqual(TISSUE_PIPS);

    await renderFight();
    act(() => { screen.getByTestId('start-wave').click(); });

    // The frame budget bounds the wait: a hang here should fail, not stall the suite.
    let seconds = 0;
    for (let frame = 0; frame < 4000 && screen.queryByTestId('result-title') === null; frame += 1) {
      seconds += 1 / 30;
      tickFrame(seconds);
    }

    const title = screen.queryByTestId('result-title');
    if (title === null) {
      throw new Error(`no result after ${String(seconds)}s of simulation with nothing built`);
    }
    expect(title.textContent).toBe('It got into the blood.');
    expect(screen.getByTestId('result-cta').textContent).toBe('Come back tomorrow');
    expect(screen.getAllByTestId('pip').filter((p) => p.dataset['lit'] === 'true')).toHaveLength(0);
  });

  /**
   * Losing used to rebuild the same board in place — "Try this case again" was a free retry.
   * A front line cannot allow that (the whole layer is that a day is spent either way), so the
   * result's only action now leaves the fight entirely rather than handing back a fresh board.
   */
  it('returns to the map, rather than rebuilding the board, when a lost case\'s result is taken', async () => {
    await renderFight();
    act(() => { screen.getByTestId('start-wave').click(); });

    let seconds = 0;
    for (let frame = 0; frame < 4000 && screen.queryByTestId('result-cta') === null; frame += 1) {
      seconds += 1 / 30;
      tickFrame(seconds);
    }
    const cta = screen.queryByTestId('result-cta');
    if (cta === null) throw new Error('the case was expected to be lost with nothing built');

    act(() => { cta.click(); });

    expect(screen.getByTestId('location').textContent).toBe('/');
  });

  /**
   * The brief's own required tests, verbatim: a clear holds the region and ends the day, and a
   * loss ends the day and lets the sickness move, rather than being a free retry.
   */
  it('ends the day and lets the sickness move when a case is lost', async () => {
    const { profile } = await renderFightLost();
    expect(profile.front.day).toBe(2);
    expect(profile.front.infected.length).toBeGreaterThan(1);
  });

  it('holds the region and ends the day when a case is cleared', async () => {
    const { profile } = await renderFightCleared();
    expect(profile.front.held).toHaveLength(1);
    expect(profile.front.day).toBe(2);
  });

  it('banks the clear and credits the strain, and persists it, when a case is won', async () => {
    await renderFight();
    if (captured.state === undefined) throw new Error('createSimState was never called');

    captured.state.totalKills = 42;
    captured.state.result = 'case';
    // Two frames: the first only establishes the previous timestamp (elapsed is always zero
    // on it), the second supplies the elapsed time the HUD publish timer needs to fire.
    tickFrame(0);
    tickFrame(0.2);

    const cta = screen.getByTestId('result-cta');
    expect(cta.textContent).toBe('Back to the body');
    act(() => { cta.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(screen.getByTestId('location').textContent).toBe('/');
    const cleared = clearCase(PROFILE, CASE.id, 42);
    const expected: Profile = { ...cleared, front: gameEndDay(cleared.front, cleared.immunity) };
    expect(persistedProfile()).toEqual(expected);
  });
});
