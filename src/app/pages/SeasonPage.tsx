import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { seasonRows, vaccineRows } from '@game/progression';
import { Season } from '@app/components/Season';
import { useProfile } from '@app/state/ProfileProvider';
import '../screens.css';

export function SeasonPage() {
  const history = useHistory();
  const { profile } = useProfile();

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
