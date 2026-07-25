import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, useLocation } from 'react-router-dom';
import { BriefPage } from './BriefPage';
import { CASE_BY_ID } from '@game/content/cases';
import { PLACEHOLDER_PROFILE } from '@app/placeholderProfile';
import { IMMUNITY_MAX } from '@game/content/rules';

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderBrief(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Route path="/brief/:caseId" component={BriefPage} />
      <Route component={LocationProbe} />
    </MemoryRouter>,
  );
}

describe('BriefPage', () => {
  it('shows the brief for a real case reached by route param', () => {
    renderBrief('/brief/forearm');
    expect(screen.getByText(CASE_BY_ID.forearm.title)).toBeInTheDocument();
    expect(screen.getByText(CASE_BY_ID.forearm.region)).toBeInTheDocument();
  });

  it('reports progress toward the credited strain from the placeholder profile', () => {
    renderBrief('/brief/forearm');
    const clears = PLACEHOLDER_PROFILE.immunity[CASE_BY_ID.forearm.credits];
    expect(screen.getByTestId('brief-shield')).toHaveTextContent(
      `No vaccine for this strain yet — ${String(clears)} of ${String(IMMUNITY_MAX)} clears done. Earned, never bought.`,
    );
  });

  it('redirects to the map for an unknown case id', () => {
    renderBrief('/brief/nonsense');
    expect(screen.getByTestId('location').textContent).toBe('/');
    expect(screen.queryByTestId('brief-shield')).not.toBeInTheDocument();
  });

  it('pushes /play/:caseId when "Get in there" is tapped', () => {
    renderBrief('/brief/throat');
    fireEvent.click(screen.getByTestId('get-in-there'));
    expect(screen.getByTestId('location').textContent).toBe('/play/throat');
  });

  it('pushes / when "Back to the body" is tapped', () => {
    renderBrief('/brief/stomach');
    fireEvent.click(screen.getByText('Back to the body'));
    expect(screen.getByTestId('location').textContent).toBe('/');
  });
});
