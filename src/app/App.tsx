import { Suspense, lazy, type ReactNode } from 'react';
import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Redirect, Route } from 'react-router-dom';
import { isRunLost } from '@game/front';
import { SaveErrorBanner } from '@app/components/SaveErrorBanner';
import { useProfile } from '@app/state/ProfileProvider';

const MapPage = lazy(() => import('./pages/MapPage').then((m) => ({ default: m.MapPage })));
const BriefPage = lazy(() => import('./pages/BriefPage').then((m) => ({ default: m.BriefPage })));
const FightPage = lazy(() => import('./pages/FightPage').then((m) => ({ default: m.FightPage })));
const ImmunityPage = lazy(() => import('./pages/ImmunityPage').then((m) => ({ default: m.ImmunityPage })));
const SeasonPage = lazy(() => import('./pages/SeasonPage').then((m) => ({ default: m.SeasonPage })));

setupIonicReact({ mode: 'ios' });

/**
 * The map is the one screen that explains why a lost run stops offering anything, so any route
 * reached by a case id has to send the player back there rather than let them wander into a case
 * through Back or a typed URL. Wrapping the route here, once, is what makes that automatic for a
 * screen added later — it inherits the guard by being declared through this rather than by
 * whoever writes it remembering to ask `isRunLost` themselves, the way `FightPage` already
 * redirects on a case id that does not exist.
 */
function RequireLiveRun({ children }: { readonly children: ReactNode }) {
  const { profile } = useProfile();
  if (isRunLost(profile.front)) return <Redirect to="/" />;
  return <>{children}</>;
}

export function App() {
  return (
    <IonApp>
      <SaveErrorBanner />
      {/* Vite's BASE_URL carries a trailing slash and is bare "/" at the site root; react-router
          wants neither, so an empty basename is the correct value in the common case. */}
      <IonReactRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Suspense fallback={null}>
          {/* Ionic's iOS mode slides a page in from the side, and every screen then runs its own
              14px rise — two entrances for one navigation, which reads as a stutter. The design's
              motion rules say nothing slides sideways, so the slide is the one to drop. */}
          <IonRouterOutlet animated={false}>
            <Route exact path="/" component={MapPage} />
            <Route
              exact
              path="/brief/:caseId"
              render={() => <RequireLiveRun><BriefPage /></RequireLiveRun>}
            />
            <Route
              exact
              path="/play/:caseId"
              render={() => <RequireLiveRun><FightPage /></RequireLiveRun>}
            />
            <Route exact path="/immunity" component={ImmunityPage} />
            <Route exact path="/season" component={SeasonPage} />
            <Route><Redirect to="/" /></Route>
          </IonRouterOutlet>
        </Suspense>
      </IonReactRouter>
    </IonApp>
  );
}
