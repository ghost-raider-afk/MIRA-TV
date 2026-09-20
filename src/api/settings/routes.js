import express from 'express';
import { siteSettingsInput, userPreferencesInput } from '../../contracts/input.js';
import { animationSettingsInput, animationTargetScreenIds } from '../../contracts/animation.js';
import { scenePlaylistInput } from '../../contracts/scene-playlist.js';
import { ValidationError } from '../../shared/errors.js';
import { activity, notFound } from '../helpers.js';
import { hashPassword, passwordChangeInput, verifyPassword } from '../../services/password-service.js';
import { issueSession, sessionCookie, themeCookie } from '../../services/session-service.js';
import { replaceSiteImage, siteSettingsResponse } from '../../services/site-assets-service.js';

async function animationInputPreservingPlaylist(store, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return animationSettingsInput(body);
  if (Object.hasOwn(body, 'scene_playlist')) return animationSettingsInput(body);
  const current = await store.getAnimationSettings();
  return animationSettingsInput({ ...body, scene_playlist: current?.scene_playlist });
}

function notifyRevisions(realtime, revisions) {
  for (const item of revisions || []) realtime?.notifyScreen(item.screen_id, item.revision);
}

function screenId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

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
  router.get('/animation', async (_request, response) => { response.json(await store.getAnimationSettings()); });
  router.get('/animation/screens/:screenId', async (request, response) => {
    const id = screenId(request.params.screenId);
    if (!id) return response.status(400).json({ error: 'Некорректный идентификатор монитора.' });
    const screen = await store.getScreen(id);
    if (!screen) return response.status(404).json({ error: 'Монитор не найден.' });
    return response.json(await store.getScreenAnimationSettings(id));
  });
  router.put('/animation', async (request, response) => {
    const input = await animationInputPreservingPlaylist(store, request.body);
    const settings = await store.updateAnimationSettings({ ...input, updated_by: request.session.sub });
    await activity(store, request, { action: 'settings.animation.updated', entity_type: 'animation_settings', entity_id: settings.id, message: 'Сохранены настройки анимации.' });
    response.json(settings);
  });

  router.put('/animation/playlist', async (request, response) => {
    const current = await store.getAnimationSettings();
    const scenePlaylist = scenePlaylistInput(request.body?.scene_playlist);
    const input = animationSettingsInput({ ...(current || {}), scene_playlist:scenePlaylist });
    const settings = await store.updateAnimationSettings({ ...input, updated_by: request.session.sub });
    await activity(store, request, { action: 'settings.playlist.updated', entity_type: 'animation_settings', entity_id: settings.id, message: 'Сохранён Scene Playlist без изменения профиля анимации.' });
    response.json(settings);
  });

  router.put('/animation/playlist/apply', async (request, response) => {
    const screenIds = animationTargetScreenIds(request.body?.screen_ids);
    const scenePlaylist = scenePlaylistInput(request.body?.scene_playlist);
    const result = await store.transaction(async (tx) => {
      const appliedScreenIds = [];
      const globalSettings = await tx.getAnimationSettings();
      for (const id of screenIds) {
        const screen = await tx.getScreen(id);
        if (!screen) throw new ValidationError('Один или несколько выбранных мониторов больше не существуют. Обновите список и повторите применение.');
        const current = await tx.getScreenAnimationSettings(id) || globalSettings;
        const settings = animationSettingsInput({ ...(current || {}), scene_playlist:scenePlaylist });
        const applied = await tx.applyAnimationSettingsToScreens([id], settings, request.session.sub);
        if (applied.length !== 1) throw new ValidationError('Не удалось применить плейлист к одному из мониторов.');
        appliedScreenIds.push(id);
      }
      const revisions = await tx.markScreenRenderChanged(
        appliedScreenIds,
        ['scene_playlist'],
        'playlist.applied',
        request.session.sub
      );
      return { applied_screen_ids:appliedScreenIds, revisions };
    });
    await activity(store, request, {
      action: 'settings.playlist.applied',
      entity_type: 'screen_animation_settings',
      entity_id: result.applied_screen_ids.join(','),
      message: `Scene Playlist применён к мониторам: ${result.applied_screen_ids.join(', ')}.`
    });
    notifyRevisions(realtime, result.revisions);
    response.json({
      applied_screen_ids: result.applied_screen_ids,
      applied_screens: result.revisions.map((item) => ({ screen_id:item.screen_id, revision:item.revision }))
    });
  });
  router.put('/animation/apply', async (request, response) => {
    const screenIds = animationTargetScreenIds(request.body?.screen_ids);
    const result = await store.transaction(async (tx) => {
      const input = await animationInputPreservingPlaylist(tx, request.body?.settings);
      const settings = await tx.updateAnimationSettings({ ...input, updated_by: request.session.sub });
      const appliedScreenIds = await tx.applyAnimationSettingsToScreens(screenIds, settings, request.session.sub);
      if (appliedScreenIds.length !== screenIds.length) {
        throw new ValidationError('Один или несколько выбранных мониторов больше не существуют. Обновите список и повторите применение.');
      }
      const revisions = await tx.markScreenRenderChanged(
        appliedScreenIds,
        ['animation', 'scene_playlist'],
        'animation.applied',
        request.session.sub
      );
      return { settings, applied_screen_ids: appliedScreenIds, revisions };
    });
    await activity(store, request, {
      action: 'settings.animation.applied',
      entity_type: 'screen_animation_settings',
      entity_id: result.applied_screen_ids.join(','),
      message: `Все анимации применены к мониторам: ${result.applied_screen_ids.join(', ')}.`
    });
    notifyRevisions(realtime, result.revisions);
    response.json({
      settings: result.settings,
      applied_screen_ids: result.applied_screen_ids,
      applied_screens: result.revisions.map((item) => ({ screen_id: item.screen_id, revision: item.revision }))
    });
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
