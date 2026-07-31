import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { CASE_REGIONS } from '@game/content/body';
import { CASE_BY_ID, ruleLabels } from '@game/content/cases';
import { nextCaseId, strainRows } from '@game/progression';
import { palette } from '@theme/tokens';
import { BodyMap } from '@app/components/BodyMap';
import { MapProgress } from '@app/components/MapProgress';
import { useProfile } from '@app/state/ProfileProvider';
import '../screens.css';

export function MapPage() {
  const history = useHistory();
  const { profile } = useProfile();
  const nextId = nextCaseId(profile);
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
            <MapProgress
              regionsHeld={profile.cleared.length}
              regionsTotal={CASE_REGIONS.length}
              strains={strainRows(profile)}
              onClick={() => { history.push('/immunity'); }}
            />
          </div>

          <footer className="screen-footer">
            <div className="pick">
              <span className="pick-swatch" style={{ background: accent }} />
              <div className="pick-text">
                <span className="pick-name">{next?.title ?? 'All clear'}</span>
                <span className="pick-sub">
                  {next === null
                    ? 'Nothing needs you today'
                    : `${region.charAt(0).toUpperCase()}${region.slice(1)} · ${ruleLabels(next).toLowerCase()} · ${String(next.waves.length)} waves`}
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
