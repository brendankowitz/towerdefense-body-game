import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { endDay as advanceFront } from '@game/front';
import {
  clearCase, createFreshProfile, frontRules, recordCoreLoss, shoreUpRegion, type Profile,
} from '@game/progression';
import { createProgressRepository } from '@progress/createProgressRepository';
import type { BodyNodeId, CaseId } from '@game/types';

interface ProfileContextValue {
  readonly profile: Profile;
  readonly saveError: boolean;
  readonly recordClear: (caseId: CaseId, totalKills: number) => void;
  /** The last stand lost. The one loss the profile remembers — see `recordCoreLoss`. */
  readonly recordLoss: () => void;
  readonly shoreUp: (node: BodyNodeId) => void;
  readonly endDay: () => void;
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

  /**
   * A win calls `recordClear` and `endDay` back to back in the same event handler. `setState`
   * never updates the `profile` a closure already captured — it only schedules the next render —
   * so a second call in that handler would read the same pre-clear profile the first one did and
   * the clear would be lost the moment `endDay` persisted over it. Every write goes through the
   * ref first, so whichever call runs second always builds on what the one before it just wrote.
   */
  const profileRef = useRef(profile);

  useEffect(() => {
    let cancelled = false;
    void repository.load().then((result) => {
      if (cancelled) return;
      if (result.status === 'loaded') {
        profileRef.current = result.profile;
        setProfile(result.profile);
      } else if (result.reason !== 'empty') {
        console.warn(`Saved progress could not be read (${result.reason}); starting a fresh body.`);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [repository]);

  const persist = useCallback((next: Profile) => {
    profileRef.current = next;
    setProfile(next);
    void repository.save(next).then(
      () => { setSaveError(false); },
      () => { setSaveError(true); },
    );
  }, [repository]);

  const value = useMemo<ProfileContextValue>(() => ({
    profile,
    saveError,
    recordClear: (caseId, totalKills) => {
      persist(clearCase(profileRef.current, caseId, totalKills));
    },
    recordLoss: () => {
      persist(recordCoreLoss(profileRef.current));
    },
    shoreUp: (node) => {
      const shored = shoreUpRegion(profileRef.current, node);
      // `shoreUpRegion` hands back the exact profile it was given, unchanged, for ground that
      // is not held — that identity is how it says "nothing happened", and nothing happened is
      // the one case reinforcing must not charge a day for.
      if (shored === profileRef.current) return;
      persist({ ...shored, front: advanceFront(shored.front, shored.immunity, frontRules(shored)) });
    },
    // The sickness's whole turn: what a cleared case, a lost case and a reinforced wall all
    // spend one of, and what an idle day spends on its own when nothing needs the player.
    endDay: () => {
      persist({
        ...profileRef.current,
        front: advanceFront(
          profileRef.current.front, profileRef.current.immunity, frontRules(profileRef.current),
        ),
      });
    },
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
