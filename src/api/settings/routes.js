import express from 'express';
import { siteSettingsInput, userPreferencesInput } from '../../contracts/input.js';
import { animationSettingsInput, animationTargetScreenIds } from '../../contracts/animation.js';
import { ValidationError } from '../../shared/errors.js';
import { activity, notFound } from '../helpers.js';
import { hashPassword, passwordChangeInput, verifyPassword } from '../../services/password-service.js';
import { issueSession, sessionCookie, themeCookie } from '../../services/session-service.js';
import { replaceSiteImage, siteSettingsResponse } from '../../services/site-assets-service.js';
import { replaceEntityAssetStream } from '../../services/entity-assets-service.js';

async function animationInputPreservingPlaylist(store, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return animationSettingsInput(body);
  if (Object.hasOwn(body, 'scene_playlist')) return animationSettingsInput(body);
  const current = await store.getAnimationSettings();
  return animationSettingsInput({ ...body, scene_playlist: current?.scene_playlist });
}

export function createSettingsRouter({ store, config }) {
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
  router.get('/animation', async (_request, response) => { response.json(await store.getAnimationSettings()); });
  router.put('/animation', async (request, response) => {
    const input = await animationInputPreservingPlaylist(store, request.body);
    const settings = await store.updateAnimationSettings({ ...input, updated_by: request.session.sub });
    await activity(store, request, { action: 'settings.animation.updated', entity_type: 'animation_settings', entity_id: settings.id, message: 'Сохранён рабочий плейлист.' }); response.json(settings);
  });
  router.put('/animation/apply', async (request, response) => {
    const screenIds = animationTargetScreenIds(request.body?.screen_ids);
    const result = await store.transaction(async (tx) => {
      const input = await animationInputPreservingPlaylist(tx, request.body?.settings);
      const settings = await tx.updateAnimationSettings({ ...input, updated_by: request.session.sub });
      const appliedScreenIds = await tx.applyAnimationSettingsToScreens(screenIds, settings, request.session.sub);
      if (appliedScreenIds.length !== screenIds.length) throw new ValidationError('Один или несколько выбранных мониторов больше не существуют. Обновите список и повторите применение.');
      return { settings, applied_screen_ids: appliedScreenIds };
    });
    await activity(store, request, {
      action: 'settings.animation.applied', entity_type: 'screen_animation_settings', entity_id: result.applied_screen_ids.join(','),
      message: `Плейлист применён к мониторам: ${result.applied_screen_ids.join(', ')}.`
    });
    response.json(result);
  });
  router.put('/animation/entity-asset', async (request, response) => {
    const settings = await replaceEntityAssetStream({
      stream: request,
      contentLength: request.get('content-length'),
      contentType: request.get('content-type'),
      config,
      store,
      username: request.session.sub
    });
    await activity(store, request, { action: 'settings.animation.entity_asset_updated', entity_type: 'animation_settings', entity_id: settings.id, message: 'Обновлён медиафайл Entity.' }); response.json(settings);
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
