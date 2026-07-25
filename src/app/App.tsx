import { Suspense, lazy } from 'react';
import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Redirect, Route } from 'react-router-dom';

const MapPage = lazy(() => import('./pages/MapPage').then((m) => ({ default: m.MapPage })));
const BriefPage = lazy(() => import('./pages/BriefPage').then((m) => ({ default: m.BriefPage })));
const FightPage = lazy(() => import('./pages/FightPage').then((m) => ({ default: m.FightPage })));
const ImmunityPage = lazy(() => import('./pages/ImmunityPage').then((m) => ({ default: m.ImmunityPage })));
const SeasonPage = lazy(() => import('./pages/SeasonPage').then((m) => ({ default: m.SeasonPage })));

setupIonicReact({ mode: 'ios' });

export function App() {
  return (
    <IonApp>
      <IonReactRouter>
        <Suspense fallback={null}>
          <IonRouterOutlet>
            <Route exact path="/" component={MapPage} />
            <Route exact path="/brief/:caseId" component={BriefPage} />
            <Route exact path="/play/:caseId" component={FightPage} />
            <Route exact path="/immunity" component={ImmunityPage} />
            <Route exact path="/season" component={SeasonPage} />
            <Route><Redirect to="/" /></Route>
          </IonRouterOutlet>
        </Suspense>
      </IonReactRouter>
    </IonApp>
  );
}
