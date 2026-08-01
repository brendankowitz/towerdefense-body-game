import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { CASE_BY_ID } from '@game/content/cases';
import { endDay as gameEndDay } from '@game/front';
import { clearCase, createFreshProfile, type Profile } from '@game/progression';
import type { LoadResult, ProgressRepository } from '@progress/ProgressRepository';

/**
 * `createProgressRepository` is mocked rather than injected — the provider deliberately has no
 * constructor seam for it (one repository per app, chosen by platform). `state` is declared
 * through `vi.hoisted` so the factory below, which vi.mock hoists above these imports, can close
 * over it.
 */
const state = vi.hoisted(() => ({
  load: (): Promise<LoadResult> => Promise.resolve({ status: 'fresh', reason: 'empty' }),
  save: (): Promise<void> => Promise.resolve(),
  saveCalls: [] as Profile[],
}));

vi.mock('@progress/createProgressRepository', () => ({
  createProgressRepository: (): ProgressRepository => ({
    load: () => state.load(),
    save: (profile: Profile) => {
      state.saveCalls.push(profile);
      return state.save();
    },
  }),
}));

const { ProfileProvider, useProfile } = await import('./ProfileProvider');

const CASE = CASE_BY_ID.forearm;

function Probe() {
  const { profile, saveError, recordClear, endDay, shoreUp, resetRun, dismissSaveError } = useProfile();
  return (
    <div>
      <span data-testid="day">{profile.front.day}</span>
      <span data-testid="bank">{profile.bank}</span>
      <span data-testid="immunity">{profile.immunity[CASE.credits]}</span>
      <span data-testid="held">{profile.front.held.length}</span>
      <span data-testid="save-error">{String(saveError)}</span>
      <button type="button" data-testid="clear" onClick={() => { recordClear(CASE.id, 7); }}>
        clear
      </button>
      <button type="button" data-testid="end-day" onClick={() => { endDay(); }}>
        end day
      </button>
      {/* Fires both in the same handler, the way a fight's result screen does — the regression
          case for a provider that reads a stale closed-over profile instead of the latest write. */}
      <button
        type="button"
        data-testid="clear-and-end"
        onClick={() => { recordClear(CASE.id, 7); endDay(); }}
      >
        clear and end
      </button>
      <button
        type="button"
        data-testid="shore-up"
        onClick={() => { shoreUp('gut'); }}
      >
        shore up
      </button>
      <button type="button" data-testid="reset" onClick={() => { resetRun(); }}>reset</button>
      <button type="button" data-testid="dismiss" onClick={() => { dismissSaveError(); }}>
        dismiss
      </button>
    </div>
  );
}

async function settle(): Promise<void> {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  state.load = () => Promise.resolve({ status: 'fresh', reason: 'empty' });
  state.save = () => Promise.resolve();
  state.saveCalls = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProfileProvider', () => {
  it('holds render until the profile resolves, so no state is ever flashed', async () => {
    let release: (() => void) | undefined;
    state.load = () => new Promise((resolve) => {
      release = () => { resolve({ status: 'fresh', reason: 'empty' }); };
    });

    render(<ProfileProvider><Probe /></ProfileProvider>);
    expect(screen.queryByTestId('day')).not.toBeInTheDocument();

    if (release === undefined) throw new Error('load was never called');
    await act(async () => { release?.(); await Promise.resolve(); });
    expect(screen.getByTestId('day').textContent).toBe(String(createFreshProfile().front.day));
  });

  it('loads a stored profile rather than the fresh default', async () => {
    const fresh = createFreshProfile();
    const stored: Profile = { ...fresh, bank: 500, front: { ...fresh.front, day: 9 } };
    state.load = () => Promise.resolve({ status: 'loaded', profile: stored });

    render(<ProfileProvider><Probe /></ProfileProvider>);
    await settle();

    expect(screen.getByTestId('day').textContent).toBe('9');
    expect(screen.getByTestId('bank').textContent).toBe('500');
  });

  it('falls back to a fresh profile and reports a corrupt or outdated save, never to the player', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    state.load = () => Promise.resolve({ status: 'fresh', reason: 'corrupt' });

    render(<ProfileProvider><Probe /></ProfileProvider>);
    await settle();

    expect(screen.getByTestId('day').textContent).toBe(String(createFreshProfile().front.day));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('corrupt');
  });

  it('reports an outdated save the same way as a corrupt one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    state.load = () => Promise.resolve({ status: 'fresh', reason: 'outdated' });

    render(<ProfileProvider><Probe /></ProfileProvider>);
    await settle();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('outdated');
  });

  it('says nothing on an ordinary empty store — that is a first run, not a failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    state.load = () => Promise.resolve({ status: 'fresh', reason: 'empty' });

    render(<ProfileProvider><Probe /></ProfileProvider>);
    await settle();

    expect(warn).not.toHaveBeenCalled();
  });

  it('does not persist a profile it just loaded unchanged', async () => {
    const fresh = createFreshProfile();
    const stored: Profile = { ...fresh, front: { ...fresh.front, day: 4 } };
    state.load = () => Promise.resolve({ status: 'loaded', profile: stored });

    render(<ProfileProvider><Probe /></ProfileProvider>);
    await settle();

    expect(state.saveCalls).toHaveLength(0);
  });

  it('banks the reward, credits the strain and holds the region on recordClear, without spending the day', async () => {
    render(<ProfileProvider><Probe /></ProfileProvider>);
    await settle();

    const before = createFreshProfile();
    act(() => { screen.getByTestId('clear').click(); });
    await settle();

    const expected = clearCase(before, CASE.id, 7);
    expect(screen.getByTestId('day').textContent).toBe(String(before.front.day));
    expect(screen.getByTestId('bank').textContent).toBe(String(expected.bank));
    expect(screen.getByTestId('immunity').textContent).toBe(String(expected.immunity[CASE.credits]));
    expect(screen.getByTestId('held').textContent).toBe('1');
    expect(state.saveCalls.at(-1)).toEqual(expected);
  });

  it('advances the day and lets the sickness move on endDay', async () => {
    render(<ProfileProvider><Probe /></ProfileProvider>);
    await settle();

    const fresh = createFreshProfile();
    act(() => { screen.getByTestId('end-day').click(); });
    await settle();

    const expected: Profile = { ...fresh, front: gameEndDay(fresh.front, fresh.immunity) };
    expect(screen.getByTestId('day').textContent).toBe(String(expected.front.day));
    expect(state.saveCalls.at(-1)).toEqual(expected);
  });

  /**
   * A fight's win handler calls `recordClear` then `endDay` back to back, in the same event
   * handler, before either write's `setState` has been applied to a render. A provider that read
   * the closed-over `profile` for both calls would have the second overwrite the first — the
   * clear would vanish the instant the day ended. This is the regression test for that.
   */
  it('keeps a clear made moments before it when endDay follows in the same breath', async () => {
    render(<ProfileProvider><Probe /></ProfileProvider>);
    await settle();

    const fresh = createFreshProfile();
    act(() => { screen.getByTestId('clear-and-end').click(); });
    await settle();

    const cleared = clearCase(fresh, CASE.id, 7);
    const expected: Profile = { ...cleared, front: gameEndDay(cleared.front, cleared.immunity) };
    expect(screen.getByTestId('held').textContent).toBe('1');
    expect(screen.getByTestId('bank').textContent).toBe(String(expected.bank));
    expect(screen.getByTestId('day').textContent).toBe(String(expected.front.day));
    expect(state.saveCalls.at(-1)).toEqual(expected);
  });

  it('spends nothing and no day on ground that is not held when shoreUp is called', async () => {
    render(<ProfileProvider><Probe /></ProfileProvider>);
    await settle();

    const fresh = createFreshProfile();
    act(() => { screen.getByTestId('shore-up').click(); });
    await settle();

    expect(screen.getByTestId('bank').textContent).toBe(String(fresh.bank));
    expect(screen.getByTestId('day').textContent).toBe(String(fresh.front.day));
    expect(state.saveCalls).toHaveLength(0);
  });

  it('returns reset to exactly the fresh profile, matching first run', async () => {
    render(<ProfileProvider><Probe /></ProfileProvider>);
    await settle();

    act(() => { screen.getByTestId('clear').click(); });
    await settle();
    act(() => { screen.getByTestId('reset').click(); });
    await settle();

    const fresh = createFreshProfile();
    expect(screen.getByTestId('day').textContent).toBe(String(fresh.front.day));
    expect(screen.getByTestId('bank').textContent).toBe(String(fresh.bank));
    expect(screen.getByTestId('immunity').textContent).toBe(String(fresh.immunity[CASE.credits]));
    expect(state.saveCalls.at(-1)).toEqual(fresh);
  });

  it('surfaces a failed write rather than losing the clear silently', async () => {
    state.save = () => Promise.reject(new Error('disk full'));
    render(<ProfileProvider><Probe /></ProfileProvider>);
    await settle();

    expect(screen.getByTestId('save-error').textContent).toBe('false');
    act(() => { screen.getByTestId('clear').click(); });
    await settle();

    expect(screen.getByTestId('save-error').textContent).toBe('true');
  });

  it('clears the save error once dismissed, without touching the profile', async () => {
    state.save = () => Promise.reject(new Error('disk full'));
    render(<ProfileProvider><Probe /></ProfileProvider>);
    await settle();

    act(() => { screen.getByTestId('clear').click(); });
    await settle();
    expect(screen.getByTestId('save-error').textContent).toBe('true');

    act(() => { screen.getByTestId('dismiss').click(); });
    expect(screen.getByTestId('save-error').textContent).toBe('false');
    expect(screen.getByTestId('day').textContent)
      .toBe(String(clearCase(createFreshProfile(), CASE.id, 7).front.day));
  });

  it('recovers a save on the next attempt after a prior failure', async () => {
    state.save = () => Promise.reject(new Error('disk full'));
    render(<ProfileProvider><Probe /></ProfileProvider>);
    await settle();

    act(() => { screen.getByTestId('clear').click(); });
    await settle();
    expect(screen.getByTestId('save-error').textContent).toBe('true');

    state.save = () => Promise.resolve();
    act(() => { screen.getByTestId('reset').click(); });
    await settle();

    expect(screen.getByTestId('save-error').textContent).toBe('false');
  });

  it('throws when used outside a ProfileProvider', () => {
    expect(() => render(<Probe />)).toThrow('useProfile must be used inside a ProfileProvider');
  });
});
