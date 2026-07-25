import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, useLocation } from 'react-router-dom';
import { MapPage } from './MapPage';
import { BODY_NODES } from '@game/content/body';
import { PLACEHOLDER_PROFILE, placeholderNextCaseId } from '@app/placeholderProfile';
import { CASE_BY_ID } from '@game/content/cases';

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderMap() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <MapPage />
      <Route component={LocationProbe} />
    </MemoryRouter>,
  );
}

describe('MapPage', () => {
  it('shows the day and the bank from the profile', () => {
    renderMap();
    expect(screen.getByText(`DAY ${String(PLACEHOLDER_PROFILE.day)} · MORNING`)).toBeInTheDocument();
    expect(screen.getByTestId('bank')).toHaveTextContent(String(PLACEHOLDER_PROFILE.bank));
  });

  it('reports regions held against the total number of non-core body nodes', () => {
    renderMap();
    const nonCoreCount = BODY_NODES.filter((n) => n.core !== true).length;
    expect(screen.getByTestId('held-count')).toHaveTextContent(
      `${String(PLACEHOLDER_PROFILE.cleared.length)} / ${String(nonCoreCount)}`,
    );
  });

  it('names the next case in the day pick', () => {
    renderMap();
    const nextId = placeholderNextCaseId(PLACEHOLDER_PROFILE.cleared);
    expect(nextId).not.toBeNull();
    if (nextId !== null) {
      expect(screen.getByText(CASE_BY_ID[nextId].title)).toBeInTheDocument();
    }
  });

  it('navigates to the brief for the next case when "Go there" is tapped', () => {
    renderMap();
    const nextId = placeholderNextCaseId(PLACEHOLDER_PROFILE.cleared);
    fireEvent.click(screen.getByTestId('go-there'));
    expect(screen.getByTestId('location')).toHaveTextContent(`/brief/${String(nextId)}`);
  });

  it('navigates to the brief when the region under attack is tapped on the map', () => {
    renderMap();
    const nextId = placeholderNextCaseId(PLACEHOLDER_PROFILE.cleared);
    if (nextId === null) throw new Error('fixture expects an open case');
    fireEvent.click(screen.getByTestId(`map-node-${CASE_BY_ID[nextId].node}`));
    expect(screen.getByTestId('location')).toHaveTextContent(`/brief/${nextId}`);
  });

  it('navigates to the season screen when "Season" is tapped', () => {
    renderMap();
    fireEvent.click(screen.getByText('Season'));
    expect(screen.getByTestId('location')).toHaveTextContent('/season');
  });
});
