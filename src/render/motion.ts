/** Whether the board may animate at all. Named rather than a boolean, so callers read. */
export type Motion = 'full' | 'reduced';

/**
 * The player's motion preference, as a live query.
 *
 * `MediaQueryList.matches` re-reads the current answer on every access, so the renderer holds
 * one of these and asks it per frame rather than caching a boolean at start-up — a preference
 * changed mid-run takes effect on the next frame, with no listener to unsubscribe.
 *
 * Null where there is no `matchMedia` at all, which is jsdom under a unit test.
 */
export function reducedMotionQuery(): MediaQueryList | null {
  if (typeof globalThis.matchMedia !== 'function') return null;
  return globalThis.matchMedia('(prefers-reduced-motion: reduce)');
}

export function motionOf(query: MediaQueryList | null): Motion {
  return query?.matches === true ? 'reduced' : 'full';
}
