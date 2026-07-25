import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Redirect, Route } from 'react-router-dom';

import { MapPage } from './pages/MapPage';
import { BriefPage } from './pages/BriefPage';
import { FightPage } from './pages/FightPage';
import { ImmunityPage } from './pages/ImmunityPage';
import { SeasonPage } from './pages/SeasonPage';

setupIonicReact({ mode: 'ios' });

export function App() {
  return (
    <IonApp>
      <IonReactRouter>
        <IonRouterOutlet>
          <Route exact path="/" component={MapPage} />
          <Route exact path="/brief/:caseId" component={BriefPage} />
          <Route exact path="/play/:caseId" component={FightPage} />
          <Route exact path="/immunity" component={ImmunityPage} />
          <Route exact path="/season" component={SeasonPage} />
          <Route><Redirect to="/" /></Route>
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  );
}
