import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource-variable/outfit';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

import '@theme/variables.css';
import '@theme/typography.css';

import { App } from '@app/App';
import { ProfileProvider } from '@app/state/ProfileProvider';

const host = document.getElementById('root');
if (!host) throw new Error('Root element #root is missing from index.html');
createRoot(host).render(
  <StrictMode>
    <ProfileProvider>
      <App />
    </ProfileProvider>
  </StrictMode>,
);
