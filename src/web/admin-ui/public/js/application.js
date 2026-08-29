import { pageName } from './core/config.js';
import { loadAuthenticatedContext } from './core/session.js';
import { initialiseNotifications } from './core/notifications.js';
import { installFrontendDiagnostics, reportFrontendError } from './core/diagnostics.js';
import { createAppRouter } from './core/router.js';
import { state } from './core/state.js';
import { initialiseShell, refreshShellRoute } from './components/shell.js';

function resetTransientPageState(name) {
  if (name === 'locations') state.editingLocationId = null;
  if (name === 'catalog') {
    state.editingProductId = null;
    state.editingPackagingId = null;
  }
}

async function initialisePage(name) {
  resetTransientPageState(name);
  switch (name) {
    case 'overview': {
      const { initialiseDashboard } = await import('./pages/dashboard.js');
      return initialiseDashboard();
    }
    case 'settings': {
      const { initialiseSettings } = await import('./pages/settings.js');
      return initialiseSettings();
    }
    case 'sftp-settings': {
      const { initialiseSftpSettings } = await import('./pages/sftp-settings.js');
      return initialiseSftpSettings();
    }
    case 'playlist':
    case 'animation': {
      const { initialisePlaylistStudio } = await import('./pages/playlist.js');
      return initialisePlaylistStudio();
    }
    case 'events': {
      const { initialiseEvents } = await import('./pages/events.js');
      return initialiseEvents();
    }
    case 'profile': {
      const { initialiseProfile } = await import('./pages/profile.js');
      return initialiseProfile();
    }
    case 'locations': {
      const { initialiseLocations } = await import('./pages/locations.js');
      return initialiseLocations();
    }
    case 'screens': {
      const { initialiseScreens } = await import('./pages/screens.js');
      return initialiseScreens();
    }
    case 'connect-tv': {
      const { initialiseConnectTv } = await import('./pages/connect-tv.js');
      return initialiseConnectTv();
    }
    case 'screen-editor': {
      const { initialiseScreenEditor } = await import('./editor/editor.js');
      return initialiseScreenEditor();
    }
    case 'catalog': {
      const { initialiseCatalog } = await import('./pages/catalog.js');
      return initialiseCatalog();
    }
    default:
      return undefined;
  }
}

async function initialiseApplication() {
  const current = pageName();
  if (current === 'signin') {
    const { initialiseSignIn } = await import('./pages/signin.js');
    initialiseSignIn();
    return;
  }

  installFrontendDiagnostics();
  try {
    await loadAuthenticatedContext();
    initialiseShell();
    initialiseNotifications();
    const router = createAppRouter({ mountPage: initialisePage, syncShell: refreshShellRoute });
    await router.start();
  } catch (error) {
    reportFrontendError(error, { type: 'application', source: 'application.js' });
    console.error('Application initialization failed', error);
    window.location.replace('/signin');
  }
}

void initialiseApplication();
