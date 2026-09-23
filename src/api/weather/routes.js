import express from 'express';
import { weatherWidgetInput } from '../../contracts/weather.js';
import { sceneWeatherSettings } from '../../contracts/scene.js';
import { hasWeatherCoordinates, searchWeatherLocations } from '../../services/weather-service.js';

function screenId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function createWeatherRouter({ store, config, weatherService }) {
  const router = express.Router();

  router.get('/screens/:screenId/snapshot', async (request, response) => {
    const id = screenId(request.params.screenId);
    if (!id) return response.status(400).json({ error: 'Некорректный идентификатор монитора.' });
    const screen = await store.getScreen(id);
    if (!screen) return response.status(404).json({ error: 'Монитор не найден.' });
    const draft = await store.getScreenDraft(id);
    const settings = sceneWeatherSettings(draft?.scene, id);
    if (!settings?.enabled || !hasWeatherCoordinates(settings)) {
      return response.status(204).end();
    }
    return response.json({ settings, snapshot: await weatherService.getSnapshot(settings) });
  });

  router.get('/locations', async (request, response) => {
    response.json(await searchWeatherLocations(request.query.q, config));
  });

  router.get('/preview', async (request, response) => {
    const settings = weatherWidgetInput({
      enabled: true,
      location_name: String(request.query.name || ''),
      latitude: request.query.latitude,
      longitude: request.query.longitude,
      timezone: String(request.query.timezone || 'auto')
    });
    response.json(await weatherService.getSnapshot(settings));
  });

  return router;
}
