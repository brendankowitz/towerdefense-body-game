import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { CASE_BY_ID } from '@game/content/cases';
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
  const { profile, saveError, recordClear, resetRun, dismissSaveError } = useProfile();
  return (
    <div>
      <span data-testid="day">{profile.day}</span>
      <span data-testid="bank">{profile.bank}</span>
      <span data-testid="immunity">{profile.immunity[CASE.credits]}</span>
      <span data-testid="save-error">{String(saveError)}</span>
      <button type="button" data-testid="clear" onClick={() => { recordClear(CASE.id, 7); }}>
        clear
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
    expect(screen.getByTestId('day').textContent).toBe(String(createFreshProfile().day));
  });

  it('loads a stored profile rather than the fresh default', async () => {
    const stored: Profile = { ...createFreshProfile(), day: 9, bank: 500 };
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

    expect(screen.getByTestId('day').textContent).toBe(String(createFreshProfile().day));
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
    const stored: Profile = { ...createFreshProfile(), day: 4 };
    state.load = () => Promise.resolve({ status: 'loaded', profile: stored });

    render(<ProfileProvider><Probe /></ProfileProvider>);
    await settle();

    expect(state.saveCalls).toHaveLength(0);
  });

  it('advances the day, banks the reward and credits the strain on recordClear', async () => {
    render(<ProfileProvider><Probe /></ProfileProvider>);
    await settle();

    act(() => { screen.getByTestId('clear').click(); });
    await settle();

    const expected = clearCase(createFreshProfile(), CASE.id, 7);
    expect(screen.getByTestId('day').textContent).toBe(String(expected.day));
    expect(screen.getByTestId('bank').textContent).toBe(String(expected.bank));
    expect(screen.getByTestId('immunity').textContent).toBe(String(expected.immunity[CASE.credits]));
    expect(state.saveCalls.at(-1)).toEqual(expected);
  });

  it('returns reset to exactly the fresh profile, matching first run', async () => {
    render(<ProfileProvider><Probe /></ProfileProvider>);
    await settle();

    act(() => { screen.getByTestId('clear').click(); });
    await settle();
    act(() => { screen.getByTestId('reset').click(); });
    await settle();

    const fresh = createFreshProfile();
    expect(screen.getByTestId('day').textContent).toBe(String(fresh.day));
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
    expect(screen.getByTestId('day').textContent).toBe(String(clearCase(createFreshProfile(), CASE.id, 7).day));
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
