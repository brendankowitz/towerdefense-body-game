import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, useLocation } from 'react-router-dom';
import { SeasonPage } from './SeasonPage';
import { createFreshProfile, seasonRows } from '@game/progression';
import { CASES } from '@game/content/cases';
import { LATER } from '@game/content/later';
import { VACCINES } from '@game/content/vaccines';
import { ProfileProvider } from '@app/state/ProfileProvider';

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

async function renderSeason() {
  const result = render(
    <ProfileProvider>
      <MemoryRouter initialEntries={['/season']}>
        <Route exact path="/season" component={SeasonPage} />
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

describe('SeasonPage', () => {
  it('lists every case and every later entry the content declares', async () => {
    await renderSeason();
    expect(screen.getAllByTestId('season-row')).toHaveLength(CASES.length + LATER.length);
  });

  it('lists every vaccine the content declares', async () => {
    await renderSeason();
    expect(screen.getAllByTestId('vaccine-row')).toHaveLength(VACCINES.length);
  });

  it('marks the next unplayed case as under way today', async () => {
    await renderSeason();
    const rows = seasonRows(PROFILE);
    const nowIndex = rows.findIndex((row) => row.state === 'now');
    expect(nowIndex).toBeGreaterThanOrEqual(0);
    expect(screen.getAllByTestId('season-row')[nowIndex]).toHaveAttribute('data-state', 'now');
  });

  it('navigates to the immunity screen when "What I\'m immune to" is tapped', async () => {
    await renderSeason();
    fireEvent.click(screen.getByText("What I'm immune to"));
    expect(screen.getByTestId('location').textContent).toBe('/immunity');
  });

  it('navigates to the map when "Back to the body" is tapped', async () => {
    await renderSeason();
    fireEvent.click(screen.getByText('Back to the body'));
    expect(screen.getByTestId('location').textContent).toBe('/');
  });
});
