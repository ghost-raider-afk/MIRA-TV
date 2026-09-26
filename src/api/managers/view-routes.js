import express from 'express';
import { positiveId } from '../../contracts/input.js';
import { buildPlayerState, fullPlayerContext } from '../../services/player-context-service.js';
import { sceneWeatherSettings } from '../../contracts/scene.js';

async function savedVisibleScreen(store, id) {
  const screen = await store.getScreen(id);
  if (!screen || screen.active === false) return null;
  const location = await store.getLocation(screen.location_id);
  if (!location || location.active === false) return null;
  return screen;
}

async function requestedPreview(realtime, screenId, timeoutMs = 1800) {
  const before = realtime?.screenPreviewMeta?.(screenId)?.etag || '';
  const requested = realtime?.requestScreenPreview?.(screenId) || 0;
  if (requested > 0) {
    const deadline = Date.now() + Math.max(250, Number(timeoutMs) || 1800);
    while (Date.now() < deadline) {
      const current = realtime?.screenPreviewMeta?.(screenId);
      if (current?.etag && current.etag !== before) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  return realtime?.screenPreview?.(screenId) || null;
}

export function createManagerViewRouter({ store, config, weatherService, realtime }) {
  const router = express.Router();

  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'private, no-store');
    next();
  });

  router.get('/overview', async (_request, response) => {
    const [locations, screens] = await Promise.all([store.listLocations(), store.listScreens()]);
    const visibleScreens = screens.filter((screen) => screen.active !== false);
    const groups = locations
      .filter((location) => location.active !== false)
      .map((location) => ({
        id: location.id,
        name: location.name,
        address: location.address,
        screens: visibleScreens
          .filter((screen) => Number(screen.location_id) === Number(location.id))
          .map((screen) => ({
            id: screen.id,
            name: screen.name,
            resolution: screen.resolution,
            location_number: screen.location_number,
            status: screen.status
          }))
      }))
      .filter((location) => location.screens.length > 0);
    response.json(groups);
  });

  router.get('/screens/:id/preview', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    if (!await savedVisibleScreen(store, id)) return response.status(404).json({ error: 'Сохранённый телевизор не найден.' });
    const preview = await requestedPreview(realtime, id);
    if (!preview) return response.status(404).json({ error: 'Кадр TV Player ещё не получен.' });
    response.setHeader('Cache-Control', 'private, no-cache');
    response.setHeader('ETag', preview.etag);
    response.setHeader('X-MIRA-Preview-Updated-At', preview.updatedAt);
    response.type(preview.contentType);
    return response.send(preview.buffer);
  });

  router.get('/screens/:id/context', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    if (!await savedVisibleScreen(store, id)) return response.status(404).json({ error: 'Сохранённый телевизор не найден.' });
    const state = await buildPlayerState(store, { screen_id: id }, config);
    if (!state) return response.status(404).json({ error: 'Телевизор недоступен.' });
    response.json(fullPlayerContext(state));
  });

  router.get('/screens/:id/weather', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    if (!await savedVisibleScreen(store, id)) return response.status(404).json({ error: 'Сохранённый телевизор не найден.' });
    const draft = await store.getScreenDraft(id);
    const settings = sceneWeatherSettings(draft?.scene, id);
    if (!settings?.enabled || !Number.isFinite(Number(settings.latitude)) || !Number.isFinite(Number(settings.longitude))) return response.status(204).end();
    const snapshot = await weatherService.getSnapshot(settings);
    response.json({ settings: { ...settings, screen_id: id }, snapshot });
  });

  return router;
}
