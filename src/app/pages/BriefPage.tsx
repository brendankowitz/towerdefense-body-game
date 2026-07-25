import { IonContent, IonPage } from '@ionic/react';
import { Redirect, useHistory, useParams } from 'react-router-dom';
import { CASES, CASE_BY_ID } from '@game/content/cases';
import type { CaseId } from '@game/types';
import { Brief } from '@app/components/Brief';
import { PLACEHOLDER_PROFILE } from '@app/placeholderProfile';
import '../screens.css';

function isCaseId(value: string): value is CaseId {
  return CASES.some((definition) => definition.id === value);
}

export function BriefPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const history = useHistory();

  if (!isCaseId(caseId)) return <Redirect to="/" />;
  const definition = CASE_BY_ID[caseId];

  // Swap for useProfile().profile.immunity[definition.credits] once @game/progression lands.
  const strainClears = PLACEHOLDER_PROFILE.immunity[definition.credits];

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
