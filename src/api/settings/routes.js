import express from 'express';
import { siteSettingsInput, userPreferencesInput } from '../../contracts/input.js';
import { activity, notFound } from '../helpers.js';
import { hashPassword, passwordChangeInput, verifyPassword } from '../../services/password-service.js';
import { issueSession, sessionCookie, themeCookie } from '../../services/session-service.js';
import { replaceSiteImage, siteSettingsResponse } from '../../services/site-assets-service.js';

export function createSettingsRouter({ store, config, realtime }) {
  const router = express.Router();
  router.get('/user', async (request, response) => response.json(await store.getUserPreferences(request.session.sub)));
  router.put('/user', async (request, response) => {
    const preferences = await store.updateUserPreferences(request.session.sub, userPreferencesInput(request.body));
    await activity(store, request, { action: 'settings.user.updated', entity_type: 'user_preferences', entity_id: request.session.sub, message: 'Обновлены личные настройки пользователя.' });
    response.setHeader('Set-Cookie', themeCookie(preferences.theme, config)); response.json(preferences);
  });
  router.put('/user/password', async (request, response) => {
    const { currentPassword, newPassword } = passwordChangeInput(request.body, config);
    if (!await verifyPassword(currentPassword, request.session.user.password_hash)) return response.status(400).json({ error: 'Текущий пароль введён неверно.' });
    const user = await store.updateUserPassword(request.session.sub, await hashPassword(newPassword)); if (!user) throw notFound();
    const preferences = await store.getUserPreferences(user.username);
    await activity(store, request, { action: 'settings.user.password_updated', entity_type: 'user', entity_id: user.username, message: 'Изменён пароль пользователя.' });
    response.setHeader('Set-Cookie', [sessionCookie(issueSession(user, config), config), themeCookie(preferences.theme, config)]); response.status(204).end();
  });
  router.get('/site', async (_request, response) => { response.json(siteSettingsResponse(await store.getSiteSettings(), config)); });
  router.put('/site', async (request, response) => {
    const settings = await store.updateSiteSettings({ ...siteSettingsInput(request.body, config), updated_by: request.session.sub });
    await activity(store, request, { action: 'settings.site.updated', entity_type: 'site_settings', entity_id: settings.id, message: 'Обновлены настройки сайта.' });
    response.json(siteSettingsResponse(settings, config));
  });
  router.put('/site/logo', express.raw({ type: '*/*', limit: config.siteLogoMaxBytes }), async (request, response) => {
    const settings = await replaceSiteImage({ kind: 'logo', bytes: request.body, config, store, username: request.session.sub });
    await activity(store, request, { action: 'settings.site.logo_updated', entity_type: 'site_settings', entity_id: settings.id, message: 'Обновлён логотип сайта.' }); response.json(siteSettingsResponse(settings, config));
  });
  router.put('/site/favicon', express.raw({ type: '*/*', limit: config.siteFaviconMaxBytes }), async (request, response) => {
    const settings = await replaceSiteImage({ kind: 'favicon', bytes: request.body, config, store, username: request.session.sub });
    await activity(store, request, { action: 'settings.site.favicon_updated', entity_type: 'site_settings', entity_id: settings.id, message: 'Обновлён favicon сайта.' }); response.json(siteSettingsResponse(settings, config));
  });
  return router;
}
