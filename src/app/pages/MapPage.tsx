import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { CASE_REGIONS } from '@game/content/body';
import { CASE_BY_ID, ruleLabels } from '@game/content/cases';
import { SHORE_UP_COST } from '@game/content/rules';
import { caseAt, hotCases } from '@game/front';
import { strainRows } from '@game/progression';
import { palette } from '@theme/tokens';
import type { BodyNodeId, CaseId } from '@game/types';
import { BodyMap } from '@app/components/BodyMap';
import { MapProgress } from '@app/components/MapProgress';
import { useProfile } from '@app/state/ProfileProvider';
import '../screens.css';

export function MapPage() {
  const history = useHistory();
  const { profile, shoreUp } = useProfile();
  const front = profile.front;

  const goToBrief = (caseId: CaseId): void => { history.push(`/brief/${caseId}`); };
  const onSelectNode = (node: BodyNodeId): void => {
    const caseId = caseAt(node);
    if (caseId !== null) goToBrief(caseId);
  };

  const today = hotCases(front).map((id) => CASE_BY_ID[id]);
  const canAffordShoreUp = profile.bank >= SHORE_UP_COST;

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
      siegeDays: front.siege[node],
    };
  });

  return (
    <IonPage>
      <IonContent fullscreen scrollY={false}>
        <div className="screen">
          <header className="screen-header">
            <div className="screen-title">
              <span className="mono kicker">{`DAY ${String(profile.day)} · MORNING`}</span>
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
              regionsHeld={profile.cleared.length}
              regionsTotal={CASE_REGIONS.length}
              strains={strainRows(profile)}
              onClick={() => { history.push('/immunity'); }}
            />
          </div>

          <footer className="screen-footer">
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
                {walls.map(({ node, title, siegeDays }) => (
                  <div key={node} className="wall-row" data-testid={`wall-${node}`}>
                    <div className="wall-text">
                      <span className="wall-name">{title}</span>
                      <span className="mono wall-days">
                        {siegeDays === undefined
                          ? 'Holding'
                          : `${String(siegeDays)} day${siegeDays === 1 ? '' : 's'} left`}
                      </span>
                    </div>
                    {canAffordShoreUp && (
                      <button
                        type="button"
                        className="wall-shoreup"
                        data-testid={`shoreup-${node}`}
                        // Reinforcing costs the day, the same as fighting does. Task 10 owns
                        // `endDay`, so for now this only moves the bank and the wall —
                        // `shoreUp` on the context will route through the same day-ending
                        // path the fight uses once it exists.
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
                // Nothing is on fire, so there is nothing to fight into — but sleeping still
                // costs the day, and Task 10's `endDay` is what will make this button do that.
                <button
                  type="button"
                  className="primary"
                  data-testid="sleep"
                  style={{ background: palette.frontline.css }}
                  disabled
                >
                  Sleep
                </button>
              )}
              <button type="button" className="tertiary" onClick={() => { history.push('/season'); }}>
                Season
              </button>
            </div>
          </footer>
        </div>
      </IonContent>
    </IonPage>
  );
}
