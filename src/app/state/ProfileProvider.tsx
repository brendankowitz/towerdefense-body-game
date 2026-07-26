import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { clearCase, createFreshProfile, type Profile } from '@game/progression';
import { createProgressRepository } from '@progress/createProgressRepository';
import type { CaseId } from '@game/types';

interface ProfileContextValue {
  readonly profile: Profile;
  readonly saveError: boolean;
  readonly recordClear: (caseId: CaseId, totalKills: number) => void;
  readonly resetRun: () => void;
  readonly dismissSaveError: () => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

/**
 * The one seam between the game and the persisted run. A failed *write* surfaces through
 * `saveError` (spec §8: losing a cleared case silently is the failure a player resents); a
 * failed or outdated *read* does not — it falls back to `createFreshProfile()` and is reported
 * only to the console, never to the player.
 */
export function ProfileProvider({ children }: { readonly children: ReactNode }) {
  const repository = useMemo(() => createProgressRepository(), []);
  const [profile, setProfile] = useState<Profile>(createFreshProfile);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void repository.load().then((result) => {
      if (cancelled) return;
      if (result.status === 'loaded') {
        setProfile(result.profile);
      } else if (result.reason !== 'empty') {
        console.warn(`Saved progress could not be read (${result.reason}); starting a fresh body.`);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [repository]);

  const persist = useCallback((next: Profile) => {
    setProfile(next);
    void repository.save(next).then(
      () => { setSaveError(false); },
      () => { setSaveError(true); },
    );
  }, [repository]);

  const value = useMemo<ProfileContextValue>(() => ({
    profile,
    saveError,
    recordClear: (caseId, totalKills) => { persist(clearCase(profile, caseId, totalKills)); },
    resetRun: () => { persist(createFreshProfile()); },
    dismissSaveError: () => { setSaveError(false); },
  }), [profile, saveError, persist]);

  // Holds render rather than mounting children against the not-yet-loaded default profile —
  // a returning player's saved day and bank must never flash as day 1 before the real load lands.
  if (loading) return null;

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const value = useContext(ProfileContext);
  if (value === null) throw new Error('useProfile must be used inside a ProfileProvider');
  return value;
}
