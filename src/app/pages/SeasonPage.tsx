import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { seasonRows, vaccineRows } from '@game/progression';
import { Season } from '@app/components/Season';
import { PLACEHOLDER_PROFILE } from '@app/placeholderProfile';
import '../screens.css';

export function SeasonPage() {
  const history = useHistory();
  // Swap for useProfile().profile once @game/progression's provider lands.
  const profile = PLACEHOLDER_PROFILE;

  return (
    <IonPage>
      <IonContent fullscreen>
        <Season
          season={seasonRows(profile)}
          vaccines={vaccineRows(profile)}
          onImmunityClick={() => { history.push('/immunity'); }}
          onMapClick={() => { history.push('/'); }}
        />
      </IonContent>
    </IonPage>
  );
}
