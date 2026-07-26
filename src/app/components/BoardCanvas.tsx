import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { CaseId } from '@game/types';
import { BoardRenderer } from '@render/BoardRenderer';
import { hitBuildSpot, screenToWorld } from '@render/viewport';

interface BoardCanvasProps {
  readonly caseId: CaseId;
  readonly onRendererReady: (renderer: BoardRenderer | null) => void;
  readonly onSpotTap: (spotIndex: number) => void;
}

/**
 * Mounts the Pixi canvas and hands the renderer back. React's tree stops at this element:
 * nothing on the play surface is a component, and nothing on it round-trips through state.
 */
export function BoardCanvas({ caseId, onRendererReady, onSpotTap }: BoardCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(onRendererReady);
  const [renderer, setRenderer] = useState<BoardRenderer | null>(null);

  useEffect(() => {
    readyRef.current = onRendererReady;
  }, [onRendererReady]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    // Application.init is async and StrictMode mounts effects twice in development, so a
    // renderer that finishes starting after its own teardown has to throw itself away.
    let cancelled = false;
    let created: BoardRenderer | null = null;

    void BoardRenderer.create(host, caseId).then(
      (instance) => {
        if (cancelled) {
          instance.destroy();
          return;
        }
        created = instance;
        setRenderer(instance);
        readyRef.current(instance);
      },
      (error: unknown) => {
        console.error('The board renderer failed to start', error);
      },
    );

    const observer = new ResizeObserver(() => { created?.resize(); });
    observer.observe(host);

    return () => {
      cancelled = true;
      observer.disconnect();
      readyRef.current(null);
      setRenderer(null);
      created?.destroy();
    };
  }, [caseId]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (renderer === null) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const [worldX, worldY] = screenToWorld(
      renderer.viewport, event.clientX - bounds.left, event.clientY - bounds.top,
    );
    const spot = hitBuildSpot(caseId, worldX, worldY);
    if (spot !== null) onSpotTap(spot);
  };

  return (
    <div
      ref={hostRef}
      data-testid="board-canvas"
      onPointerDown={handlePointerDown}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--tissue-field)',
        touchAction: 'none',
      }}
    />
  );
}
