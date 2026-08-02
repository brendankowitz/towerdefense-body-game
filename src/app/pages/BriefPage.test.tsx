import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, useLocation } from 'react-router-dom';
import { BriefPage } from './BriefPage';
import { CASES, CASE_BY_ID } from '@game/content/cases';
import { blocksAmnesia, createFreshProfile, type Profile } from '@game/progression';
import { IMMUNITY_MAX } from '@game/content/rules';
import { STORAGE_KEY, encode } from '@progress/ProgressRepository';
import { ProfileProvider } from '@app/state/ProfileProvider';
import type { StrainId } from '@game/types';

/** See the same mock in `Brief.test.tsx`: the feature ships off, and nothing renders behind it. */
vi.mock('@game/content/rules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@game/content/rules')>();
  return { ...actual, ARRIVALS_ENABLED: true };
});

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

async function renderBrief(path: string) {
  const result = render(
    <ProfileProvider>
      <MemoryRouter initialEntries={[path]}>
        <Route path="/brief/:caseId" component={BriefPage} />
        <Route component={LocationProbe} />
      </MemoryRouter>
    </ProfileProvider>,
  );
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return result;
}

const PROFILE = createFreshProfile();

/** A saved run for the page to load, written the way the app writes one. */
function seedProfile(profile: Profile) {
  localStorage.setItem(STORAGE_KEY, encode(profile));
}

beforeEach(() => {
  localStorage.clear();
});

describe('BriefPage', () => {
  it('shows the brief for a real case reached by route param', async () => {
    await renderBrief('/brief/forearm');
    expect(screen.getByText(CASE_BY_ID.forearm.title)).toBeInTheDocument();
    expect(screen.getByText(CASE_BY_ID.forearm.region)).toBeInTheDocument();
  });

  it('reports progress toward the credited strain from the fresh profile', async () => {
    await renderBrief('/brief/forearm');
    const clears = PROFILE.immunity[CASE_BY_ID.forearm.credits];
    expect(screen.getByTestId('brief-shield')).toHaveTextContent(
      `No vaccine for this strain yet — ${String(clears)} of ${String(IMMUNITY_MAX)} clears done. Earned, never bought.`,
    );
  });

  it('redirects to the map for an unknown case id', async () => {
    await renderBrief('/brief/nonsense');
    expect(screen.getByTestId('location').textContent).toBe('/');
    expect(screen.queryByTestId('brief-shield')).not.toBeInTheDocument();
  });

  it('pushes /play/:caseId when "Get in there" is tapped', async () => {
    await renderBrief('/brief/throat');
    fireEvent.click(screen.getByTestId('get-in-there'));
    expect(screen.getByTestId('location').textContent).toBe('/play/throat');
  });

  it('pushes / when "Back to the body" is tapped', async () => {
    await renderBrief('/brief/stomach');
    fireEvent.click(screen.getByText('Back to the body'));
    expect(screen.getByTestId('location').textContent).toBe('/');
  });
});

/**
 * The amnesia mask is the page's half of the memory line, and the half a component test cannot
 * reach: the component is handed what this case's simulation is entitled to, and deciding that
 * from the profile is what `immunityFor` and `blocksAmnesia` are for. A brief that promised help
 * the case is about to delete is the broken promise the Tetanus caveat in `vaccines.ts` records.
 */
describe('BriefPage and the memory a case takes away', () => {
  const wiping = CASES.find((definition) => definition.wipes !== undefined);

  /** Everything at zero but the strain this case wipes, so the mask is the only thing deciding. */
  function onlyTheWipedStrain(wipes: StrainId): Profile {
    return {
      ...createFreshProfile(),
      immunity: { staph: 0, film: 0, virus: 0, [wipes]: IMMUNITY_MAX },
    };
  }

  it('promises nothing for a strain the case is about to take away', async () => {
    expect(wiping, 'no amnesia case in the season').toBeDefined();
    if (wiping?.wipes === undefined) return;

    const profile = onlyTheWipedStrain(wiping.wipes);
    expect(blocksAmnesia(profile), 'this fixture already blocks the wipe').toBe(false);
    seedProfile(profile);

    await renderBrief(`/brief/${wiping.id}`);
    expect(screen.queryByTestId('brief-memory')).not.toBeInTheDocument();
  });

  it('promises it again once MMR blocks the wipe', async () => {
    expect(wiping, 'no amnesia case in the season').toBeDefined();
    if (wiping?.wipes === undefined) return;

    const profile: Profile = {
      ...onlyTheWipedStrain(wiping.wipes),
      cleared: CASES.slice(0, 2).map((definition) => definition.id),
    };
    expect(blocksAmnesia(profile), 'this fixture does not reach the MMR gate').toBe(true);
    seedProfile(profile);

    await renderBrief(`/brief/${wiping.id}`);
    expect(screen.getByTestId('brief-memory')).toBeInTheDocument();
  });
});
