import { IonContent, IonPage } from '@ionic/react';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { Redirect, useHistory, useParams } from 'react-router-dom';
import {
  advanceToNextWave, placeDefender, selectDefender, startWave, toggleSpeed, triggerFever,
} from '@game/commands';
import { CASES, CASE_BY_ID, ruleLabels } from '@game/content/cases';
import { isLastStand } from '@game/front';
import { GameLoop } from '@game/loop';
import { blocksAmnesia, type Profile } from '@game/progression';
import { createSimState } from '@game/state';
import type { CaseId, SimState } from '@game/types';
import type { BoardRenderer } from '@render/BoardRenderer';
import { BoardCanvas } from '@app/components/BoardCanvas';
import { DefenderDock } from '@app/components/DefenderDock';
import { PlacedCells } from '@app/components/PlacedCells';
import { EnergyPill } from '@app/components/EnergyPill';
import { FeverButton } from '@app/components/FeverButton';
import { ResultSheet } from '@app/components/ResultSheet';
import { TissuePips } from '@app/components/TissuePips';
import { useProfile } from '@app/state/ProfileProvider';
import { useGameLoop } from '@app/state/useGameLoop';
import { useHud } from '@app/state/useHud';
import '../fight.css';

function isCaseId(value: string): value is CaseId {
  return CASES.some((definition) => definition.id === value);
}

function createLoop(caseId: CaseId, profile: Profile): GameLoop {
  return new GameLoop(createSimState({
    caseId,
    immunity: profile.immunity,
    clearedCount: profile.cleared.length,
    day: profile.front.day,
    totalKills: profile.kills,
    blocksAmnesia: blocksAmnesia(profile),
  }));
}

/**
 * The fight itself. Mounted under a key of the case id, so a different case is a different
 * instance and nothing — loop, renderer, selection — can survive from the last one.
 */
function Fight({ caseId }: { readonly caseId: CaseId }) {
  const history = useHistory();
  const { profile, recordClear, recordLoss, endDay } = useProfile();

  const rendererRef = useRef<BoardRenderer | null>(null);
  // A case that is lost or won both leave this screen (`endDay` and a route push) rather than
  // rebuilding the board in place, so nothing here ever needs to replace the loop after mount.
  const [loop] = useState<GameLoop>(() => createLoop(caseId, profile));
  /**
   * Which placed cell is open for reabsorbing or growing. It lives here rather than inside
   * PlacedCells so that tapping the cell on the board opens it too — that is the gesture a
   * player reaches for first, and it did nothing while the row owned its own selection.
   */
  const [chosenSpot, setChosenSpot] = useState<number | null>(null);

  const hud = useHud(loop);

  // Dev-only: dynamically imported so the panel and tuning.ts's export machinery are absent
  // from a production build (spec §4.1). `import.meta.env.DEV` is a compile-time constant Vite
  // replaces with `false` in production, which Rollup then tree-shakes this whole branch on.
  const [TuningPanel, setTuningPanel] = useState<ComponentType<{ readonly loop: GameLoop }> | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let cancelled = false;
    void import('@app/dev/TuningPanel').then((module) => {
      if (!cancelled) setTuningPanel(() => module.TuningPanel);
    });
    return () => { cancelled = true; };
  }, []);

  const onRendererReady = useCallback((renderer: BoardRenderer | null) => {
    rendererRef.current = renderer;
  }, []);

  const onFrame = useCallback((state: SimState, elapsedSeconds: number) => {
    rendererRef.current?.draw(state, elapsedSeconds);
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
  const lastStand = isLastStand(caseId);

  /**
   * Losing the last stand is remembered on the way *out* of this screen, whichever way that is.
   * The result sheet's action, the browser's Back button and any client-side push all unmount the
   * fight, and all of them have to mean the same thing — a loss recorded by one button is a run
   * that ends only if the player presses that button, which is exactly what the sheet's own
   * "Leave the region" control walked away from with the heart still fightable.
   *
   * On the way out rather than the moment the result lands, because `RequireLiveRun` redirects a
   * lost run off this route: recording it any earlier would take the sheet that announces the
   * ending off the screen before it could be read.
   */
  const lastStandLost = useRef(false);
  useEffect(() => {
    if (lastStand && hud.result === 'lost') lastStandLost.current = true;
  }, [lastStand, hud.result]);

  // `recordLoss` is a new closure on every profile change, so the cleanup below is written
  // against a ref instead: depending on the callback itself would fire it on the next save
  // rather than on the way out.
  const recordLossRef = useRef(recordLoss);
  useEffect(() => { recordLossRef.current = recordLoss; }, [recordLoss]);
  useEffect(() => () => { if (lastStandLost.current) recordLossRef.current(); }, []);

  /**
   * A day is spent once the fight has begun, not once it is resolved. Reading the brief and
   * backing out during the opening build costs nothing — nothing has happened yet for the
   * sickness to take advantage of. `startWave` moves the phase off `'build'` and it never comes
   * back to a first-ever build once it has: a case that returns to `'build'` between waves is at
   * `waveIndex > 0`, so this stays true for the rest of the case either way, win or lose.
   */
  const fightHasBegun = hud.phase !== 'build' || hud.waveIndex > 0;

  /**
   * The day itself, spent exactly once for this fight however the player leaves it.
   *
   * `leaveFight` covers every exit the app offers. The browser's own Back button is one it does
   * not: it unmounts the fight with no `endDay` at all, which is precisely the free retry this
   * rule exists to remove, on a web-deployed game where Back is an ordinary gesture. So the
   * unmount is the backstop, in the same shape as `lastStandLost` above — and `daySpent` is what
   * keeps that backstop from charging a second day for the in-app exits, whose route push
   * unmounts this page immediately afterward.
   *
   * Written against refs for the same reason the loss is: `endDay` is a new closure on every
   * profile change, so a cleanup that depended on the callback would fire on the next save
   * rather than on the way out.
   */
  const daySpent = useRef(false);
  const endDayRef = useRef(endDay);
  useEffect(() => { endDayRef.current = endDay; }, [endDay]);
  const spendDay = useCallback((): void => {
    if (daySpent.current) return;
    daySpent.current = true;
    endDayRef.current();
  }, []);

  const fightHasBegunRef = useRef(fightHasBegun);
  useEffect(() => { fightHasBegunRef.current = fightHasBegun; }, [fightHasBegun]);
  useEffect(() => () => { if (fightHasBegunRef.current) spendDay(); }, [spendDay]);

  /**
   * The only way off this screen once the fight has begun, and the header icon's whole handler
   * before then too — so there is exactly one place that decides whether leaving costs a day,
   * not a copy of the rule at every exit. "Try this case again" was a free retry; a header icon
   * that skipped this same check would just be a second one, and a win discarded through it
   * would be worse than a free retry — the clear, the reward and the held region gone with it.
   */
  const leaveFight = (): void => {
    if (fightHasBegun) spendDay();
    history.push('/');
  };

  const onResultPrimary = (): void => {
    switch (hud.result) {
      case 'wave':
        run(() => { advanceToNextWave(loop.state); });
        return;
      case 'case':
        recordClear(caseId, loop.state.totalKills);
        spendDay();
        history.push('/');
        return;
      case 'lost':
        // No branch for the heart here on purpose: every exit from a lost last stand records it,
        // and this is only one of them (see `lastStandLost` above).
        leaveFight();
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
                {`${region} · ${ruleLabels(definition).toUpperCase()}`}
              </span>
              <span className="fight-wave" data-testid="fight-wave">
                {`Wave ${String(hud.waveIndex + 1)} of ${String(hud.waveCount)}`}
              </span>
            </div>
            <EnergyPill energy={hud.energy} />
            {hud.result === null && (
              // Hidden rather than disabled once a result is on screen — the sheet is the only
              // way off the page from there, never a second, cheaper door beside it.
              <button
                type="button"
                className="icon-button"
                aria-label="Leave the region"
                data-testid="leave"
                onClick={leaveFight}
              >
                <span className="pause-bar" />
                <span className="pause-bar" />
              </button>
            )}
          </header>

          <TissuePips tissue={hud.tissue} />

          <div className="board">
            <BoardCanvas
              caseId={caseId}
              onRendererReady={onRendererReady}
              onSpotTap={(spot) => {
                const occupied = loop.state.towers.some((tower) => tower.spotIndex === spot);
                if (occupied) {
                  setChosenSpot((open) => (open === spot ? null : spot));
                  return;
                }
                setChosenSpot(null);
                run(() => { placeDefender(loop.state, spot); });
              }}
            />
            <span className="mono board-hint" data-testid="board-hint">
              {buildPhase
                ? hud.selected === null ? 'PICK A CELL BELOW' : 'TAP A JUNCTION TO PLACE'
                : hud.enemyCount > 0 ? `${String(hud.enemyCount)} IN THE VESSEL` : 'INCOMING'}
            </span>
            {hud.phase === 'wave' && (
              <span className="mono board-modifier" data-testid="board-modifier">
                <span className="modifier-dot pulse" />
                {ruleLabels(definition).toUpperCase()}
              </span>
            )}
          </div>

          <footer className="fight-footer">
            <PlacedCells loop={loop} chosenSpot={chosenSpot} onChoose={setChosenSpot} />
            <div className="dock-row">
              <DefenderDock
                energy={hud.energy}
                selected={hud.selected}
                daysElapsed={loop.state.day - 1}
                buildPhase={buildPhase}
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
              tissue={hud.tissue}
              caseTitle={definition.title}
              lastStand={lastStand}
              onPrimary={onResultPrimary}
              onLeave={leaveFight}
            />
          )}

          {TuningPanel !== null && <TuningPanel loop={loop} />}
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
