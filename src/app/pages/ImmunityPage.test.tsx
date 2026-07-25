import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, useLocation } from 'react-router-dom';
import { ImmunityPage } from './ImmunityPage';
import { strainRows } from '@game/progression';
import { PLACEHOLDER_PROFILE } from '@app/placeholderProfile';

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderImmunity() {
  return render(
    <MemoryRouter initialEntries={['/immunity']}>
      <Route exact path="/immunity" component={ImmunityPage} />
      <Route component={LocationProbe} />
    </MemoryRouter>,
  );
}

describe('ImmunityPage', () => {
  it('renders one strain card per row the placeholder profile produces', () => {
    renderImmunity();
    const rows = strainRows(PLACEHOLDER_PROFILE);
    for (const row of rows) {
      expect(screen.getByTestId(`strain-${row.key}`)).toHaveTextContent(row.name);
    }
  });

  it('shows a fresh profile as fully unvaccinated', () => {
    renderImmunity();
    const total = strainRows(PLACEHOLDER_PROFILE).length;
    expect(screen.getByText(`KEPT FOREVER · 0 of ${String(total)}`)).toBeInTheDocument();
  });

  it("shows the placeholder profile's run stats", () => {
    renderImmunity();
    expect(screen.getByTestId('stat-days').textContent).toBe(String(PLACEHOLDER_PROFILE.day));
    expect(screen.getByTestId('stat-kills').textContent).toBe(String(PLACEHOLDER_PROFILE.kills));
    expect(screen.getByTestId('stat-regions').textContent).toBe(String(PLACEHOLDER_PROFILE.cleared.length));
  });

  it('navigates to the season screen when "Season & vaccines" is tapped', () => {
    renderImmunity();
    fireEvent.click(screen.getByText('Season & vaccines'));
    expect(screen.getByTestId('location').textContent).toBe('/season');
  });

  it('navigates to the map when "Start a new body" is tapped', () => {
    renderImmunity();
    fireEvent.click(screen.getByTestId('reset-run'));
    expect(screen.getByTestId('location').textContent).toBe('/');
  });
});
