import { useEffect, useRef } from 'react';
import type { GameLoop } from '@game/loop';
import type { SimState } from '@game/types';

/**
 * Drives one GameLoop from one animation frame callback — the only rAF in the application.
 *
 * The browser stops issuing frames to a hidden page, so the simulation pauses by itself;
 * the visibility listener is what stops it catching up on return. Backgrounding therefore
 * never costs a wave.
 *
 * `onFrame` is handed the same elapsed seconds the simulation was just advanced by, because
 * the renderer has effects that fade over time and no clock of its own to fade them against.
 * It is the raw measurement: what to clamp it to and what to scale it by is the reader's
 * business, and the simulation and the renderer answer that differently.
 */
export function useGameLoop(
  loop: GameLoop | null,
  onFrame: (state: SimState, elapsedSeconds: number) => void,
): void {
  const onFrameRef = useRef(onFrame);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    if (loop === null) return;

    let handle = 0;
    /**
     * Timestamp of the previous frame in seconds, or null for "no previous frame" — a
     * separate sentinel rather than zero, so a frame that legitimately arrives at t=0 is
     * a baseline like any other rather than being silently discarded.
     */
    let previous: number | null = null;

    const frame = (timestamp: number): void => {
      handle = requestAnimationFrame(frame);
      if (document.hidden) {
        previous = null;
        return;
      }
      const now = timestamp / 1000;
      const elapsed = previous === null ? 0 : now - previous;
      previous = now;
      loop.advance(elapsed);
      onFrameRef.current(loop.state, elapsed);
    };

    const onVisibilityChange = (): void => {
      previous = null;
      loop.resetClock();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    handle = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(handle);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loop]);
}
