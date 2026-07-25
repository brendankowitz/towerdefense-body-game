import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { BODY_NODES } from '@game/content/body';
import { CASE_BY_ID } from '@game/content/cases';
import { palette } from '@theme/tokens';
import { BodyMap } from '@app/components/BodyMap';
import { PLACEHOLDER_PROFILE, placeholderNextCaseId } from '@app/placeholderProfile';
import '../screens.css';

export function MapPage() {
  const history = useHistory();
  // Swap for useProfile().profile and nextCaseId(profile) once @game/progression lands.
  const profile = PLACEHOLDER_PROFILE;
  const nextId = placeholderNextCaseId(profile.cleared);
  const next = nextId === null ? null : CASE_BY_ID[nextId];

  const region = next === null ? '' : next.region.split(' · ')[0]?.toLowerCase() ?? '';
  const accent = next === null ? palette.frontline.css : palette.threat.css;
  const goToBrief = () => { if (nextId !== null) history.push(`/brief/${nextId}`); };

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
            <BodyMap
              cleared={profile.cleared}
              activeNode={next?.node ?? null}
              onSelectCase={goToBrief}
            />
            <div className="map-legend">
              <span><i style={{ background: palette.threat.css }} />UNDER ATTACK</span>
              <span><i style={{ background: palette.frontline.css }} />HELD</span>
              <span><i style={{ background: palette.notReached.css }} />NOT REACHED</span>
            </div>
            <div className="map-held">
              <span className="mono kicker">REGIONS HELD</span>
              <span className="mono map-held-count" data-testid="held-count">
                {`${String(profile.cleared.length)} / ${String(BODY_NODES.filter((n) => n.core !== true).length)}`}
              </span>
            </div>
          </div>

          <footer className="screen-footer">
            <div className="pick">
              <span className="pick-swatch" style={{ background: accent }} />
              <div className="pick-text">
                <span className="pick-name">{next?.title ?? 'All clear'}</span>
                <span className="pick-sub">
                  {next === null
                    ? 'Nothing needs you today'
                    : `${region.charAt(0).toUpperCase()}${region.slice(1)} · ${next.ruleLabel.toLowerCase()} · ${String(next.waves.length)} waves`}
                </span>
              </div>
            </div>
            <div className="footer-actions">
              <button
                type="button"
                className="primary"
                data-testid="go-there"
                style={{ background: accent }}
                onClick={goToBrief}
              >
                {next === null ? 'Sleep' : 'Go there'}
              </button>
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
