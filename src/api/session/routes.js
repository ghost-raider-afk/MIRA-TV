import express from 'express';
import { themeCookie } from '../../services/session-service.js';
import { siteSettingsResponse } from '../../services/site-assets-service.js';

function sessionResponse(request, preferences, settings, config) {
  return {
    status: 'ok',
    app_name: settings.application_name || config.appName,
    username: request.session.sub,
    display_name: preferences.display_name,
    theme: preferences.theme,
    notifications_enabled: preferences.notifications_enabled
  };
}

export function createSessionRouter({ store, config }) {
  const router = express.Router();

  router.get('/session', async (request, response) => {
    const [preferences, settings] = await Promise.all([
      store.getUserPreferences(request.session.sub),
      store.getSiteSettings()
    ]);
    response.setHeader('Set-Cookie', themeCookie(preferences.theme, config));
    response.json(sessionResponse(request, preferences, settings, config));
  });

  router.get('/session/context', async (request, response) => {
    const [preferences, settings] = await Promise.all([
      store.getUserPreferences(request.session.sub),
      store.getSiteSettings()
    ]);
    response.setHeader('Set-Cookie', themeCookie(preferences.theme, config));
    response.json({
      session: sessionResponse(request, preferences, settings, config),
      user: preferences,
      site: siteSettingsResponse(settings, config)
    });
  });

  return router;
}
