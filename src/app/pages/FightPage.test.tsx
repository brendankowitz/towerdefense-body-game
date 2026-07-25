import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, useLocation } from 'react-router-dom';
import { CASE_BY_ID } from '@game/content/cases';
import { DEFENDERS } from '@game/content/defenders';
import { FEVER_DURATION, TISSUE_PIPS } from '@game/content/rules';
import { PLACEHOLDER_PROFILE } from '@app/placeholderProfile';
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

const CASE = CASE_BY_ID.forearm;

/** Hand-driven animation frames, so a test decides how much time passes. */
const frames: ((timestamp: number) => void)[] = [];

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

/** Renders and lets the board's asynchronous start settle, after which taps are accepted. */
async function renderFight(path = `/play/${CASE.id}`): Promise<void> {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Route exact path="/play/:caseId" component={FightPage} />
      <Route component={LocationProbe} />
    </MemoryRouter>,
  );
  await act(async () => { await Promise.resolve(); });
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
      .toBe(`${region} · ${CASE.ruleLabel.toUpperCase()}`);
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
    expect(DEFENDERS.mem.unlock).toBeGreaterThan(PLACEHOLDER_PROFILE.cleared.length);

    act(() => { locked.click(); });
    expect(screen.getByTestId('dock-card-mem')).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows the case rule on the board only while a wave is running', async () => {
    await renderFight();
    expect(screen.queryByTestId('board-modifier')).not.toBeInTheDocument();

    act(() => { screen.getByTestId('start-wave').click(); });

    const modifier = screen.getByTestId('board-modifier');
    expect(modifier.textContent).toBe(CASE.ruleLabel.toUpperCase());
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

  it('leaves the region when the header control is used', async () => {
    await renderFight();
    act(() => { screen.getByTestId('leave').click(); });
    expect(screen.getByTestId('location').textContent).toBe('/');
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
    expect(screen.getByTestId('result-cta').textContent).toBe('Try this case again');
    expect(screen.getAllByTestId('pip').filter((p) => p.dataset['lit'] === 'true')).toHaveLength(0);
  });

  it('gives back a fresh board when the lost case is taken again', async () => {
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

    expect(screen.queryByTestId('result-title')).not.toBeInTheDocument();
    expect(energy()).toBe(CASE.startingEnergy);
    expect(screen.getByTestId('fight-wave').textContent)
      .toBe(`Wave 1 of ${String(CASE.waves.length)}`);
    expect(screen.getAllByTestId('pip').filter((p) => p.dataset['lit'] === 'true'))
      .toHaveLength(TISSUE_PIPS);
  });
});
