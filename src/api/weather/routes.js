import express from 'express';
import { weatherTargetScreenIds, weatherWidgetInput } from '../../contracts/weather.js';
import { getWeatherSnapshot, searchWeatherLocations } from '../../services/weather-service.js';
import { activity } from '../helpers.js';

function notifyRevisions(realtime, revisions) {
  for (const item of revisions || []) realtime?.notifyScreen(item.screen_id, item.revision);
}

export function createWeatherRouter({ store, config, realtime }) {
  const router = express.Router();

  router.get('/settings', async (_request, response) => {
    response.json(await store.getWeatherSettings());
  });

  router.put('/settings', async (request, response) => {
    const input = weatherWidgetInput(request.body);
    const saved = await store.updateWeatherSettings(input, request.session.sub);
    await activity(store, request, {
      action: 'weather.settings.updated',
      entity_type: 'weather_settings',
      entity_id: 1,
      message: 'Сохранены настройки виджета погоды.'
    });
    response.json(saved);
  });

  router.put('/apply', async (request, response) => {
    const screenIds = weatherTargetScreenIds(request.body?.screen_ids);
    const result = await store.transaction(async (tx) => {
      const input = weatherWidgetInput(request.body?.settings);
      const settings = await tx.updateWeatherSettings(input, request.session.sub);
      const applied = await tx.applyWeatherSettingsToScreens(screenIds, settings, request.session.sub);
      const revisions = await tx.markScreenRenderChanged(applied, ['weather'], 'weather.applied', request.session.sub);
      return { settings, applied_screen_ids: applied, revisions };
    });
    notifyRevisions(realtime, result.revisions);
    await activity(store, request, {
      action: 'weather.applied',
      entity_type: 'screen_weather_settings',
      entity_id: result.applied_screen_ids.join(','),
      message: `Погода применена к мониторам: ${result.applied_screen_ids.join(', ')}.`
    });
    response.json({ settings: result.settings, applied_screen_ids: result.applied_screen_ids });
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
    response.json(await getWeatherSnapshot(settings, config));
  });

  return router;
}
