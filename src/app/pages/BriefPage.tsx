import { IonContent, IonPage } from '@ionic/react';
import { Redirect, useHistory, useParams } from 'react-router-dom';
import { CASES, CASE_BY_ID } from '@game/content/cases';
import type { CaseId } from '@game/types';
import { Brief } from '@app/components/Brief';
import { useProfile } from '@app/state/ProfileProvider';
import '../screens.css';

function isCaseId(value: string): value is CaseId {
  return CASES.some((definition) => definition.id === value);
}

export function BriefPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const history = useHistory();
  const { profile } = useProfile();

  if (!isCaseId(caseId)) return <Redirect to="/" />;
  const definition = CASE_BY_ID[caseId];

  const strainClears = profile.immunity[definition.credits];

  return (
    <IonPage>
      <IonContent fullscreen>
        <Brief
          definition={definition}
          strainClears={strainClears}
          onStartCase={() => { history.push(`/play/${caseId}`); }}
          onBack={() => { history.push('/'); }}
        />
      </IonContent>
    </IonPage>
  );
}
