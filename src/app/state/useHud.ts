import { useSyncExternalStore } from 'react';
import type { GameLoop, HudSnapshot } from '@game/loop';
import { TISSUE_PIPS } from '@game/content/rules';

/**
 * What the HUD shows before a loop exists. Module level on purpose: `useSyncExternalStore`
 * compares snapshots by identity, so a `getSnapshot` that built a fresh object every call
 * would re-render forever. This is the single most common way to get this hook wrong.
 */
const IDLE: HudSnapshot = {
  phase: 'build',
  result: null,
  energy: 0,
  tissue: TISSUE_PIPS,
  waveIndex: 0,
  waveCount: 0,
  selected: null,
  fast: false,
  feverSeconds: 0,
  feverUsed: false,
  enemyCount: 0,
  occupiedMask: 0,
  waveKills: 0,
  waveLeaks: 0,
};

const noop = (): (() => void) => () => undefined;
const idle = (): HudSnapshot => IDLE;

/**
 * The React half of the boundary: chrome re-renders at the loop's ~10 Hz publish rate while
 * the board keeps drawing at 60. Nothing on the play surface passes through here.
 */
export function useHud(loop: GameLoop | null): HudSnapshot {
  return useSyncExternalStore(
    loop?.subscribe ?? noop,
    loop?.getSnapshot ?? idle,
    idle,
  );
}
