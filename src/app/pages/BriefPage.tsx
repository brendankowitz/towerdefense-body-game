import { IonContent, IonPage } from '@ionic/react';
import { Redirect, useHistory, useParams } from 'react-router-dom';
import { CASES, CASE_BY_ID } from '@game/content/cases';
import { blocksAmnesia } from '@game/progression';
import { immunityFor } from '@game/state';
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
  // The same masking `createLoop` hands `createSimState` on the next screen, from the same
  // function: what this brief promises has to be what the fight will actually read, and an
  // amnesia case is about to take one strain away for its whole duration.
  const memory = immunityFor(profile.immunity, definition.wipes, blocksAmnesia(profile));

  return (
    <IonPage>
      <IonContent fullscreen>
        <Brief
          definition={definition}
          strainClears={strainClears}
          memory={memory}
          onStartCase={() => { history.push(`/play/${caseId}`); }}
          onBack={() => { history.push('/'); }}
        />
      </IonContent>
    </IonPage>
  );
}
