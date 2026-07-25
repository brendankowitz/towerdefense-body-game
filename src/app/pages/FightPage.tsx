import { IonContent, IonPage } from '@ionic/react';
import { useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { placeDefender, startWave } from '@game/commands';
import { CASES } from '@game/content/cases';
import { GameLoop } from '@game/loop';
import { createSimState } from '@game/state';
import type { CaseId, DefenderKind } from '@game/types';
import type { BoardRenderer } from '@render/BoardRenderer';
import { BoardCanvas } from '@app/components/BoardCanvas';
import { useGameLoop } from '@app/state/useGameLoop';

function isCaseId(value: string): value is CaseId {
  return CASES.some((definition) => definition.id === value);
}

/**
 * Temporary scaffolding so the board has something to draw. The real fight screen — dock,
 * HUD, placement, result sheets — is Phase 9, and it replaces everything below the canvas.
 */
const DEMO_PLACEMENTS: readonly (readonly [DefenderKind, number])[] = [
  ['phago', 0],
  ['clot', 1],
  ['anti', 3],
  ['phago', 4],
];

function createDemoLoop(caseId: CaseId): GameLoop {
  const state = createSimState({
    caseId,
    immunity: { staph: 0, film: 0, virus: 0 },
    clearedCount: 2,
    totalKills: 0,
  });
  for (const [kind, spotIndex] of DEMO_PLACEMENTS) {
    state.selected = kind;
    placeDefender(state, spotIndex);
  }
  startWave(state);
  return new GameLoop(state);
}

export function FightPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const rendererRef = useRef<BoardRenderer | null>(null);

  const loop = useMemo(() => (isCaseId(caseId) ? createDemoLoop(caseId) : null), [caseId]);

  const onRendererReady = useCallback((renderer: BoardRenderer | null) => {
    rendererRef.current = renderer;
  }, []);

  const onFrame = useCallback(() => {
    const renderer = rendererRef.current;
    if (renderer === null || loop === null) return;
    renderer.draw(loop.state);
  }, [loop]);

  useGameLoop(loop, onFrame);

  if (!isCaseId(caseId)) {
    return <IonPage><IonContent>Unknown case</IonContent></IonPage>;
  }

  return (
    <IonPage>
      <IonContent fullscreen scrollY={false}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <BoardCanvas
            caseId={caseId}
            onRendererReady={onRendererReady}
            onSpotTap={() => { /* placement lands in Phase 9 */ }}
          />
        </div>
      </IonContent>
    </IonPage>
  );
}
