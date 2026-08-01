import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { CASE_REGIONS } from '@game/content/body';
import { CASE_BY_ID, ruleLabels } from '@game/content/cases';
import { SHORE_UP_COST } from '@game/content/rules';
import { caseAt, heldRegionCount, hotCases, isRunLost, isRunWon, wallStatus } from '@game/front';
import { strainRows } from '@game/progression';
import { palette } from '@theme/tokens';
import type { BodyNodeId, CaseId } from '@game/types';
import { BodyMap } from '@app/components/BodyMap';
import { MapProgress } from '@app/components/MapProgress';
import { useProfile } from '@app/state/ProfileProvider';
import '../screens.css';

export function MapPage() {
  const history = useHistory();
  const { profile, shoreUp, endDay, resetRun } = useProfile();
  const front = profile.front;
  /**
   * The sickness standing on the core. Nothing in the app read this before — a run could reach
   * it and the map would keep offering the day's choices forever, with no signal the body was
   * gone. Once it is true, the map stops being an offer of anything: no case to tap into, no
   * wall to shore up, no day to sleep through.
   */
  const lost = isRunLost(front);
  /**
   * The other ending, and until now the one the app could reach and not draw. It is the majority
   * outcome of a run at the shipped constants, and it rendered as "All clear" over a Sleep button
   * that the player could press forever. A won run is over in exactly the sense a lost one is:
   * there is no ground left to take, so there is no day left worth spending.
   */
  const won = isRunWon(front);
  const over = lost || won;

  const goToBrief = (caseId: CaseId): void => { history.push(`/brief/${caseId}`); };
  const onSelectNode = (node: BodyNodeId): void => {
    if (over) return;
    const caseId = caseAt(node);
    if (caseId !== null) goToBrief(caseId);
  };

  const today = hotCases(front).map((id) => CASE_BY_ID[id]);
  const canAffordShoreUp = !over && profile.bank >= SHORE_UP_COST;
  const endingColour = lost ? palette.threat.css : palette.frontline.css;

  /**
   * Every region held, named from the case it was won. The map draws a hint of this on the
   * ground itself, but `<svg role="img">` flattens everything inside it for assistive
   * technology — the region names, the days a wall has left, and the button that spends the
   * bank all have to exist as real DOM here too, or a keyboard or screen-reader player could
   * never reach the choice at all.
   */
  const walls = front.held.map((node) => {
    const caseId = caseAt(node);
    return {
      node,
      title: caseId === null ? node : CASE_BY_ID[caseId].title,
      status: wallStatus(front, node),
    };
  });

  return (
    <IonPage>
      <IonContent fullscreen scrollY={false}>
        <div className="screen">
          <header className="screen-header">
            <div className="screen-title">
              <span className="mono kicker">{`DAY ${String(front.day)} · MORNING`}</span>
              <span className="screen-heading-sm">The body</span>
            </div>
            <div className="energy-pill">
              <span className="energy-dot" />
              <span className="mono" data-testid="bank">{String(profile.bank)}</span>
            </div>
          </header>

          <div className="map-field">
            <BodyMap front={front} onSelectCase={onSelectNode} canShoreUp={canAffordShoreUp} />
            <div className="map-legend">
              <span><i style={{ background: palette.threat.css }} />UNDER ATTACK</span>
              <span><i style={{ background: palette.frontline.css }} />HELD</span>
              <span><i style={{ background: palette.notReached.css }} />NOT REACHED</span>
            </div>
            <MapProgress
              regionsHeld={heldRegionCount(front)}
              regionsTotal={CASE_REGIONS.length}
              strains={strainRows(profile)}
              onClick={() => { history.push('/immunity'); }}
            />
          </div>

          <footer className="screen-footer">
            {over ? (
              // The one screen an ended run shows, whichever ending it reached: what happened,
              // stated once, and the one action left — never the day's choices, a wall to shore
              // up, or a day to sleep through, because none of those exist for a run that is
              // already decided. Both endings share this shape on purpose; only the colour, the
              // two lines and the test id tell them apart.
              <>
                <div className="pick" data-testid={lost ? 'run-lost' : 'run-won'}>
                  <span className="pick-swatch" style={{ background: endingColour }} />
                  <div className="pick-text">
                    <span className="pick-name">
                      {lost ? 'The sickness reached the heart' : 'The body holds every region'}
                    </span>
                    <span className="pick-sub">
                      {lost ? 'This run is over' : 'The sickness has nowhere left to be'}
                    </span>
                  </div>
                </div>
                <div className="footer-actions">
                  <button
                    type="button"
                    className="primary"
                    data-testid="reset-run"
                    style={{ background: endingColour }}
                    onClick={() => { resetRun(); }}
                  >
                    Start a new body
                  </button>
                </div>
              </>
            ) : (
              <>
                {today.length === 0
                  ? (
                    <div className="pick">
                      <span className="pick-swatch" style={{ background: palette.frontline.css }} />
                      <div className="pick-text">
                        <span className="pick-name">All clear</span>
                        <span className="pick-sub">Nothing needs you today</span>
                      </div>
                    </div>
                  )
                  : (
                    <div className="day-choices" data-testid="day-choices">
                      {today.map((definition) => {
                        const region = definition.region.split(' · ')[0]?.toLowerCase() ?? '';
                        return (
                          <button
                            key={definition.id}
                            type="button"
                            className="pick pick-choice"
                            data-testid={`pick-${definition.id}`}
                            onClick={() => { goToBrief(definition.id); }}
                          >
                            <span className="pick-swatch" style={{ background: palette.threat.css }} />
                            <div className="pick-text">
                              <span className="pick-name">{definition.title}</span>
                              <span className="pick-sub">
                                {`${region.charAt(0).toUpperCase()}${region.slice(1)} · ${ruleLabels(definition).toLowerCase()} · ${String(definition.waves.length)} waves`}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                {walls.length > 0 && (
                  <div className="wall-list" data-testid="wall-list">
                    {walls.map(({ node, title, status }) => (
                      <div key={node} className="wall-row" data-testid={`wall-${node}`}>
                        <div className="wall-text">
                          <span className="wall-name">{title}</span>
                          <span className="mono wall-days">{status}</span>
                        </div>
                        {canAffordShoreUp && (
                          <button
                            type="button"
                            className="wall-shoreup"
                            data-testid={`shoreup-${node}`}
                            onClick={() => { shoreUp(node); }}
                          >
                            {`Shore up ${title} · ${String(SHORE_UP_COST)}`}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="footer-actions">
                  {today.length === 0 && (
                    // Nothing is on fire, so there is nothing to fight into — but the sickness
                    // still gets its step, the same as it would on a day spent fighting or
                    // shoring up.
                    <button
                      type="button"
                      className="primary"
                      data-testid="sleep"
                      style={{ background: palette.frontline.css }}
                      onClick={() => { endDay(); }}
                    >
                      Sleep
                    </button>
                  )}
                  <button type="button" className="tertiary" onClick={() => { history.push('/season'); }}>
                    Season
                  </button>
                </div>
              </>
            )}
          </footer>
        </div>
      </IonContent>
    </IonPage>
  );
}
