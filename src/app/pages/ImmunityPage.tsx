import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { heldRegionCount } from '@game/front';
import { strainRows } from '@game/progression';
import { Immunity } from '@app/components/Immunity';
import { useProfile } from '@app/state/ProfileProvider';
import '../screens.css';

export function ImmunityPage() {
  const history = useHistory();
  const { profile, resetRun } = useProfile();

  return (
    <IonPage>
      <IonContent fullscreen>
        <Immunity
          rows={strainRows(profile)}
          day={profile.front.day}
          kills={profile.kills}
          regionsHeld={heldRegionCount(profile.front)}
          onSeasonClick={() => { history.push('/season'); }}
          onResetClick={() => { resetRun(); history.push('/'); }}
        />
      </IonContent>
    </IonPage>
  );
}
