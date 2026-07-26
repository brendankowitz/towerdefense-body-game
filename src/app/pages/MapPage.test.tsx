import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, useLocation } from 'react-router-dom';
import { MapPage } from './MapPage';
import { BODY_NODES } from '@game/content/body';
import { createFreshProfile, nextCaseId } from '@game/progression';
import { CASE_BY_ID } from '@game/content/cases';
import { ProfileProvider } from '@app/state/ProfileProvider';

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

async function renderMap() {
  const result = render(
    <ProfileProvider>
      <MemoryRouter initialEntries={['/']}>
        <MapPage />
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

describe('MapPage', () => {
  it('shows the day and the bank from the profile', async () => {
    await renderMap();
    expect(screen.getByText(`DAY ${String(PROFILE.day)} · MORNING`)).toBeInTheDocument();
    expect(screen.getByTestId('bank').textContent).toBe(String(PROFILE.bank));
  });

  it('reports regions held against the total number of non-core body nodes', async () => {
    await renderMap();
    const nonCoreCount = BODY_NODES.filter((n) => n.core !== true).length;
    expect(screen.getByTestId('held-count').textContent).toBe(
      `${String(PROFILE.cleared.length)} / ${String(nonCoreCount)}`,
    );
  });

  it('names the next case in the day pick', async () => {
    await renderMap();
    const nextId = nextCaseId(PROFILE);
    expect(nextId).not.toBeNull();
    if (nextId !== null) {
      expect(screen.getByText(CASE_BY_ID[nextId].title)).toBeInTheDocument();
    }
  });

  it('navigates to the brief for the next case when "Go there" is tapped', async () => {
    await renderMap();
    const nextId = nextCaseId(PROFILE);
    fireEvent.click(screen.getByTestId('go-there'));
    expect(screen.getByTestId('location').textContent).toBe(`/brief/${String(nextId)}`);
  });

  it('navigates to the brief when the region under attack is tapped on the map', async () => {
    await renderMap();
    const nextId = nextCaseId(PROFILE);
    if (nextId === null) throw new Error('fixture expects an open case');
    fireEvent.click(screen.getByTestId(`map-node-${CASE_BY_ID[nextId].node}`));
    expect(screen.getByTestId('location').textContent).toBe(`/brief/${nextId}`);
  });

  it('navigates to the season screen when "Season" is tapped', async () => {
    await renderMap();
    fireEvent.click(screen.getByText('Season'));
    expect(screen.getByTestId('location').textContent).toBe('/season');
  });
});
