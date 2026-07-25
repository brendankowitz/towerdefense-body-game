import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { strainRows } from '@game/progression';
import { Immunity } from '@app/components/Immunity';
import { PLACEHOLDER_PROFILE } from '@app/placeholderProfile';
import '../screens.css';

export function ImmunityPage() {
  const history = useHistory();
  // Swap for useProfile().profile once @game/progression's provider lands.
  const profile = PLACEHOLDER_PROFILE;

  return (
    <IonPage>
      <IonContent fullscreen>
        <Immunity
          rows={strainRows(profile)}
          day={profile.day}
          kills={profile.kills}
          regionsHeld={profile.cleared.length}
          onSeasonClick={() => { history.push('/season'); }}
          onResetClick={() => { history.push('/'); }}
        />
      </IonContent>
    </IonPage>
  );
}
