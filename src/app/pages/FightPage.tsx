import { IonContent, IonPage } from '@ionic/react';
import { useCallback, useRef, useState } from 'react';
import { Redirect, useHistory, useParams } from 'react-router-dom';
import {
  advanceToNextWave, placeDefender, restartCase, selectDefender, startWave, toggleSpeed,
  triggerFever,
} from '@game/commands';
import { CASES, CASE_BY_ID } from '@game/content/cases';
import { GameLoop } from '@game/loop';
import { createSimState } from '@game/state';
import type { CaseId, SimState } from '@game/types';
import type { BoardRenderer } from '@render/BoardRenderer';
import { BoardCanvas } from '@app/components/BoardCanvas';
import { DefenderDock } from '@app/components/DefenderDock';
import { EnergyPill } from '@app/components/EnergyPill';
import { FeverButton } from '@app/components/FeverButton';
import { ResultSheet } from '@app/components/ResultSheet';
import { TissuePips } from '@app/components/TissuePips';
import { PLACEHOLDER_PROFILE, type PlaceholderProfile } from '@app/placeholderProfile';
import { useGameLoop } from '@app/state/useGameLoop';
import { useHud } from '@app/state/useHud';
import '../fight.css';

function isCaseId(value: string): value is CaseId {
  return CASES.some((definition) => definition.id === value);
}

function createLoop(caseId: CaseId, profile: PlaceholderProfile): GameLoop {
  return new GameLoop(createSimState({
    caseId,
    immunity: profile.immunity,
    clearedCount: profile.cleared.length,
    // The real profile carries a lifetime kill count; the placeholder does not yet.
    totalKills: 0,
  }));
}

/**
 * The fight itself. Mounted under a key of the case id, so a different case is a different
 * instance and nothing — loop, renderer, selection — can survive from the last one.
 */
function Fight({ caseId }: { readonly caseId: CaseId }) {
  const history = useHistory();
  // Swap for useProfile().profile once the provider lands. One line, one place.
  const profile = PLACEHOLDER_PROFILE;

  const rendererRef = useRef<BoardRenderer | null>(null);
  const [loop, setLoop] = useState<GameLoop>(() => createLoop(caseId, profile));

  const hud = useHud(loop);

  const onRendererReady = useCallback((renderer: BoardRenderer | null) => {
    rendererRef.current = renderer;
  }, []);

  const onFrame = useCallback((state: SimState) => {
    rendererRef.current?.draw(state);
  }, []);

  useGameLoop(loop, onFrame);

  /**
   * Every command publishes straight away. The 10 Hz throttle governs the simulation's own
   * changes; a tap the player made should never read back up to 100 ms late.
   */
  const run = (mutate: () => void): void => {
    mutate();
    loop.publish();
  };

  const definition = CASE_BY_ID[caseId];
  const buildPhase = hud.phase === 'build' || hud.phase === 'built';
  const region = definition.region.split(' · ')[0] ?? definition.region;

  const onResultPrimary = (): void => {
    switch (hud.result) {
      case 'wave':
        run(() => { advanceToNextWave(loop.state); });
        return;
      case 'case':
        // The clear is banked by the profile provider in a later pass; the placeholder is fixed.
        history.push('/');
        return;
      case 'lost':
        setLoop(new GameLoop(restartCase(loop.state)));
        return;
      case null:
        return;
    }
  };

  return (
    <IonPage>
      <IonContent fullscreen scrollY={false}>
        <div className="fight">
          <header className="fight-header">
            <div className="fight-title">
              <span className="mono fight-region" data-testid="fight-region">
                {`${region} · ${definition.ruleLabel.toUpperCase()}`}
              </span>
              <span className="fight-wave" data-testid="fight-wave">
                {`Wave ${String(hud.waveIndex + 1)} of ${String(hud.waveCount)}`}
              </span>
            </div>
            <EnergyPill energy={hud.energy} />
            <button
              type="button"
              className="icon-button"
              aria-label="Leave the region"
              data-testid="leave"
              onClick={() => { history.push('/'); }}
            >
              <span className="pause-bar" />
              <span className="pause-bar" />
            </button>
          </header>

          <TissuePips tissue={hud.tissue} />

          <div className="board">
            <BoardCanvas
              caseId={caseId}
              onRendererReady={onRendererReady}
              onSpotTap={(spot) => { run(() => { placeDefender(loop.state, spot); }); }}
            />
            <span className="mono board-hint" data-testid="board-hint">
              {buildPhase
                ? hud.selected === null ? 'PICK A CELL BELOW' : 'TAP A JUNCTION TO PLACE'
                : hud.enemyCount > 0 ? `${String(hud.enemyCount)} IN THE VESSEL` : 'INCOMING'}
            </span>
            {hud.phase === 'wave' && (
              <span className="mono board-modifier" data-testid="board-modifier">
                <span className="modifier-dot pulse" />
                {definition.ruleLabel.toUpperCase()}
              </span>
            )}
          </div>

          <footer className="fight-footer">
            <div className="dock-row">
              <DefenderDock
                energy={hud.energy}
                selected={hud.selected}
                clearedCount={profile.cleared.length}
                onSelect={(kind) => { run(() => { selectDefender(loop.state, kind); }); }}
              />
              <FeverButton
                seconds={hud.feverSeconds}
                used={hud.feverUsed}
                available={hud.phase === 'wave' && !hud.feverUsed}
                onUse={() => { run(() => { triggerFever(loop.state); }); }}
              />
            </div>
            <div className="action-row">
              <button
                type="button"
                className="fight-primary"
                data-testid="start-wave"
                data-enabled={String(buildPhase)}
                onClick={() => { run(() => { startWave(loop.state); }); }}
              >
                {buildPhase ? `Start wave ${String(hud.waveIndex + 1)}` : 'Wave in progress'}
              </button>
              <button
                type="button"
                className="mono fight-speed"
                data-testid="speed"
                onClick={() => { run(() => { toggleSpeed(loop.state); }); }}
              >
                {hud.fast ? '2×' : '1×'}
              </button>
            </div>
          </footer>

          {hud.result !== null && (
            <ResultSheet
              result={hud.result}
              waveIndex={hud.waveIndex}
              waveCount={hud.waveCount}
              kills={hud.waveKills}
              leaks={hud.waveLeaks}
              caseTitle={definition.title}
              onPrimary={onResultPrimary}
              onLeave={() => { history.push('/'); }}
            />
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}

export function FightPage() {
  const { caseId } = useParams<{ caseId: string }>();
  if (!isCaseId(caseId)) return <Redirect to="/" />;
  return <Fight key={caseId} caseId={caseId} />;
}
