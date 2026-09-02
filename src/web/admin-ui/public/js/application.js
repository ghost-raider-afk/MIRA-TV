import { pageName } from './core/config.js';
import { loadAuthenticatedContext } from './core/session.js';
import { initialiseNotifications } from './core/notifications.js';
import { installFrontendDiagnostics, reportFrontendError } from './core/diagnostics.js';
import { createAppRouter, navigate } from './core/router.js';
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
    case 'scenes': {
      const { initialiseScenes } = await import('./pages/scenes.js');
      return initialiseScenes();
    }
    case 'scene-editor': {
      const [{ initialiseSceneEditor }, { initialiseScenePublishControl }, { initialiseSceneFormatControls }, { initialiseSceneRibbon }, { initialiseSceneDesigner }] = await Promise.all([
        import('./scenes/editor.js'),
        import('./scenes/publish-control.js'),
        import('./scenes/format-controls.js'),
        import('./scenes/ribbon.js'),
        import('./scenes/designer.js')
      ]);
      await initialiseSceneEditor();
      initialiseSceneFormatControls();
      initialiseSceneRibbon();
      initialiseSceneDesigner();
      return initialiseScenePublishControl();
    }
    case 'settings': {
      const { initialiseSettings } = await import('./pages/settings.js');
      return initialiseSettings();
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
    case 'screen-editor':
      return navigate('/screens.html', { replace: true });
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
