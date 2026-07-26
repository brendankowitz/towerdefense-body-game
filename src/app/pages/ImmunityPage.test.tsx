import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, useLocation } from 'react-router-dom';
import { ImmunityPage } from './ImmunityPage';
import { clearCase, createFreshProfile, strainRows } from '@game/progression';
import { CASE_BY_ID } from '@game/content/cases';
import { encode, STORAGE_KEY } from '@progress/ProgressRepository';
import { ProfileProvider } from '@app/state/ProfileProvider';

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

async function renderImmunity() {
  const result = render(
    <ProfileProvider>
      <MemoryRouter initialEntries={['/immunity']}>
        <Route exact path="/immunity" component={ImmunityPage} />
        <Route component={LocationProbe} />
      </MemoryRouter>
    </ProfileProvider>,
  );
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return result;
}

const PROFILE = createFreshProfile();

beforeEach(() => {
  localStorage.clear();
});

describe('ImmunityPage', () => {
  it('renders one strain card per row the fresh profile produces', async () => {
    await renderImmunity();
    const rows = strainRows(PROFILE);
    for (const row of rows) {
      expect(screen.getByTestId(`strain-${row.key}`)).toHaveTextContent(row.name);
    }
  });

  it('shows a fresh profile as fully unvaccinated', async () => {
    await renderImmunity();
    const total = strainRows(PROFILE).length;
    expect(screen.getByText(`KEPT FOREVER · 0 of ${String(total)}`)).toBeInTheDocument();
  });

  it("shows the fresh profile's run stats", async () => {
    await renderImmunity();
    expect(screen.getByTestId('stat-days').textContent).toBe(String(PROFILE.day));
    expect(screen.getByTestId('stat-kills').textContent).toBe(String(PROFILE.kills));
    expect(screen.getByTestId('stat-regions').textContent).toBe(String(PROFILE.cleared.length));
  });

  it('navigates to the season screen when "Season & vaccines" is tapped', async () => {
    await renderImmunity();
    fireEvent.click(screen.getByText('Season & vaccines'));
    expect(screen.getByTestId('location').textContent).toBe('/season');
  });

  it('navigates to the map when "Start a new body" is tapped', async () => {
    await renderImmunity();
    fireEvent.click(screen.getByTestId('reset-run'));
    expect(screen.getByTestId('location').textContent).toBe('/');
  });

  it('actually resets the run, not just the route, when "Start a new body" is tapped', async () => {
    // Play a case first so there is progress a silent navigate-only reset could leave behind.
    const played = clearCase(PROFILE, CASE_BY_ID.forearm.id, 3);
    localStorage.setItem(STORAGE_KEY, encode(played));

    await renderImmunity();
    expect(screen.getByTestId('stat-days').textContent).toBe(String(played.day));

    fireEvent.click(screen.getByTestId('reset-run'));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    // The page navigates away on reset, so the reset is proven through what got persisted
    // rather than by re-reading a screen that has already unmounted.
    expect(screen.getByTestId('location').textContent).toBe('/');
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as { profile?: unknown };
    expect(stored.profile).toEqual(PROFILE);
  });
});
