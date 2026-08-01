import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, useLocation } from 'react-router-dom';
import { MapPage } from './MapPage';
import { BODY_NODES } from '@game/content/body';
import { CASE_BY_ID } from '@game/content/cases';
import { SHORE_UP_COST } from '@game/content/rules';
import { hotCases, nodeOf } from '@game/front';
import { clearCase, createFreshProfile, strainRows, type Profile } from '@game/progression';
import { encode, STORAGE_KEY } from '@progress/ProgressRepository';
import { ProfileProvider } from '@app/state/ProfileProvider';
import type { BodyNodeId } from '@game/types';

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
const TODAY = hotCases(PROFILE.front).map((id) => CASE_BY_ID[id]);

beforeEach(() => {
  localStorage.clear();
});

describe('MapPage', () => {
  it('shows the day and the bank from the profile', async () => {
    await renderMap();
    expect(screen.getByText(`DAY ${String(PROFILE.day)} · MORNING`)).toBeInTheDocument();
    expect(screen.getByTestId('bank').textContent).toBe(String(PROFILE.bank));
  });

  /**
   * The denominator is the promise the map makes, so it counts the regions a case can be fought
   * over and not every circle drawn: a joint is pass-through and no season will ever hold one.
   *
   * Counted here from `BODY_NODES` rather than read off `CASE_REGIONS`, which is what the page
   * itself uses. Reading the same derived list would make this move whenever that list did — the
   * expectation would follow the code it is meant to hold, and a `CASE_REGIONS` that quietly went
   * back to counting joints would still pass. Two independent counts is the whole of the check.
   */
  it('reports regions held against the regions a case can be fought over', async () => {
    await renderMap();
    const regions = BODY_NODES.filter((n) => n.core !== true && n.connective !== true);

    expect(regions.length).toBeLessThan(BODY_NODES.length);
    expect(screen.getByTestId('held-count').textContent).toBe(
      `${String(PROFILE.cleared.length)} / ${String(regions.length)}`,
    );
  });

  /** A fresh body opens with exactly one door under attack — this is the fixture, not a guess. */
  it('lists the case at the door the front line opened on as today\'s choice', async () => {
    await renderMap();
    expect(TODAY).toHaveLength(1);
    const only = TODAY[0];
    if (only === undefined) throw new Error('fixture expects an open front');
    expect(screen.getByText(only.title)).toBeInTheDocument();
  });

  it('navigates to the brief when a day choice is tapped', async () => {
    await renderMap();
    const only = TODAY[0];
    if (only === undefined) throw new Error('fixture expects an open front');
    fireEvent.click(screen.getByTestId(`pick-${only.id}`));
    expect(screen.getByTestId('location').textContent).toBe(`/brief/${only.id}`);
  });

  it('navigates to the brief when the region under attack is tapped on the map', async () => {
    await renderMap();
    const only = TODAY[0];
    if (only === undefined) throw new Error('fixture expects an open front');
    fireEvent.click(screen.getByTestId(`map-node-${only.node}`));
    expect(screen.getByTestId('location').textContent).toBe(`/brief/${only.id}`);
  });

  it('navigates to the season screen when "Season" is tapped', async () => {
    await renderMap();
    fireEvent.click(screen.getByText('Season'));
    expect(screen.getByTestId('location').textContent).toBe('/season');
  });

  it('shows one immunity chip per strain from strainRows, with its exact progress', async () => {
    await renderMap();
    const rows = strainRows(PROFILE);
    expect(screen.getAllByTestId(/^map-strain-/)).toHaveLength(rows.length);
    for (const row of rows) {
      const chip = screen.getByTestId(`map-strain-${row.key}`);
      expect(chip).toHaveAttribute('data-held', String(row.held));
      expect(chip.querySelector('.map-progress-value')?.textContent).toBe(row.progress);
    }
  });

  it('navigates to the immunity screen when the progress card is tapped', async () => {
    await renderMap();
    fireEvent.click(screen.getByTestId('map-progress'));
    expect(screen.getByTestId('location').textContent).toBe('/immunity');
  });

  /**
   * A fresh body opens with `FRESH_PROFILE.bank = 240` and `SHORE_UP_COST = 120`, so shoring up
   * is affordable from day one — the map has no held ground yet to offer it on, though, which is
   * what this actually proves: the affordance is gated on ground held, not only on the bank.
   */
  it('offers no shore up affordance before any ground is held', async () => {
    await renderMap();
    expect(PROFILE.bank).toBeGreaterThanOrEqual(SHORE_UP_COST);
    expect(screen.queryByText('SHORE UP')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wall-list')).not.toBeInTheDocument();
  });

  /**
   * `BodyMap`'s root is `<svg role="img">`, which flattens everything inside it for assistive
   * technology — so the map's own "SHORE UP" hint can never be the real control. These tests
   * cover the real one: a focusable button in the page's own DOM, next to the day's choices,
   * whose visible (and so accessible) name states the region and what it costs, with the wall's
   * countdown reachable as ordinary text beside it rather than only as a mark on the picture.
   */
  describe('shoring up a wall', () => {
    function heldProfile(): { readonly profile: Profile; readonly node: BodyNodeId; readonly title: string } {
      const fresh = createFreshProfile();
      const [firstHot] = hotCases(fresh.front);
      if (firstHot === undefined) throw new Error('fixture expects an open front');
      return {
        profile: clearCase(fresh, firstHot, 0),
        node: nodeOf(firstHot),
        title: CASE_BY_ID[firstHot].title,
      };
    }

    it('lists a real, focusable control naming the region held and what it costs', async () => {
      const { profile, node, title } = heldProfile();
      localStorage.setItem(STORAGE_KEY, encode(profile));
      await renderMap();

      expect(screen.getByRole('button', { name: `Shore up ${title} · ${String(SHORE_UP_COST)}` }))
        .toBeInTheDocument();
      expect(screen.getByTestId(`wall-${node}`)).toHaveTextContent('Holding');
    });

    it('spends the bank and reinforces the wall when the control is activated', async () => {
      const { profile, node } = heldProfile();
      localStorage.setItem(STORAGE_KEY, encode(profile));
      await renderMap();

      fireEvent.click(screen.getByTestId(`shoreup-${node}`));
      await act(async () => { await Promise.resolve(); });

      expect(screen.getByTestId('bank').textContent).toBe(String(profile.bank - SHORE_UP_COST));
      expect(screen.getByTestId(`wall-${node}`)).toHaveTextContent('day');
    });

    it('still lists the wall, and its countdown as reachable text, when the bank cannot afford it', async () => {
      const { profile, node } = heldProfile();
      localStorage.setItem(STORAGE_KEY, encode({ ...profile, bank: SHORE_UP_COST - 1 }));
      await renderMap();

      expect(screen.getByTestId(`wall-${node}`)).toHaveTextContent('Holding');
      expect(screen.queryByTestId(`shoreup-${node}`)).not.toBeInTheDocument();
    });
  });
});
