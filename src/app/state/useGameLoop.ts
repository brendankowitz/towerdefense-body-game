import { useEffect, useRef } from 'react';
import type { GameLoop } from '@game/loop';
import type { SimState } from '@game/types';

/**
 * Drives one GameLoop from one animation frame callback — the only rAF in the application.
 *
 * The browser stops issuing frames to a hidden page, so the simulation pauses by itself;
 * the visibility listener is what stops it catching up on return. Backgrounding therefore
 * never costs a wave.
 */
export function useGameLoop(loop: GameLoop | null, onFrame: (state: SimState) => void): void {
  const onFrameRef = useRef(onFrame);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    if (loop === null) return;

    let handle = 0;
    /** Timestamp of the previous frame in seconds. Zero means "no previous frame". */
    let previous = 0;

    const frame = (timestamp: number): void => {
      handle = requestAnimationFrame(frame);
      if (document.hidden) {
        previous = 0;
        return;
      }
      const now = timestamp / 1000;
      const elapsed = previous === 0 ? 0 : now - previous;
      previous = now;
      loop.advance(elapsed);
      onFrameRef.current(loop.state);
    };

    const onVisibilityChange = (): void => {
      previous = 0;
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
