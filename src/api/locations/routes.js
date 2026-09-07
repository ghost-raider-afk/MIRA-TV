import express from 'express';
import { locationInput, positiveId } from '../../contracts/input.js';
import { menuSettingsInput } from '../../contracts/menu-settings.js';
import { deleteScreenBackground } from '../../services/screen-background-service.js';
import { activity, conflict, notFound } from '../helpers.js';

function screenIds(rows) {
  return [...new Set((rows || []).map((row) => Number(row.id ?? row.screen_id)).filter(Number.isSafeInteger))];
}

function notifyRevisions(realtime, revisions) {
  for (const item of revisions || []) realtime?.notifyScreen(item.screen_id, item.revision);
}

export function createLocationsRouter({ store, config, realtime }) {
  const router = express.Router();
  router.get('/', async (_request, response) => response.json(await store.listLocations()));
  router.post('/', async (request, response) => {
    const location = await store.createLocation(locationInput(request.body));
    await activity(store, request, { action: 'location.created', entity_type: 'location', entity_id: location.id, message: `Создана торговая точка «${location.name}».` });
    response.status(201).json(location);
  });

  router.post('/:id/clone', async (request, response) => {
    const sourceId = positiveId(request.params.id, 'id');
    const input = locationInput(request.body);
    const result = await store.transaction(async (tx) => {
      const source = await tx.getLocation(sourceId);
      if (!source) throw notFound();
      const created = await tx.createLocation(input);
      const sourceScreens = await tx.listScreensByLocation(sourceId);
      const clonedIds = [];
      for (const sourceScreen of sourceScreens) {
        const [sourceDraft, sourceAnimation, sourceWeather] = await Promise.all([
          tx.getScreenDraft(sourceScreen.id),
          tx.getScreenAnimationSettings(sourceScreen.id),
          tx.getScreenWeatherSettings(sourceScreen.id)
        ]);
        const cloned = await tx.createScreen({ location_id: created.id, name: sourceScreen.name, resolution: sourceScreen.resolution, status: 'draft', active: sourceScreen.active !== false });
        const settings = menuSettingsInput(sourceDraft.settings || {}, { allowBackgroundImage: true, maxWidth: config.screenMaxWidth, maxHeight: config.screenMaxHeight });
        const saved = await tx.saveScreenDraft(cloned.id, { rows: structuredClone(sourceDraft.rows || []), settings }, 1);
        if (!saved) throw conflict('Не удалось создать независимую копию мониторов торговой точки.');
        if (sourceAnimation) {
          const applied = await tx.applyAnimationSettingsToScreens([cloned.id], sourceAnimation, request.session.sub);
          if (applied.length !== 1) throw conflict('Не удалось скопировать плейлист монитора торговой точки.');
        }
        if (sourceWeather) await tx.applyWeatherSettingsToScreens([cloned.id], sourceWeather, request.session.sub);
        clonedIds.push(cloned.id);
      }
      const revisions = clonedIds.length
        ? await tx.markScreenRenderChanged(clonedIds, ['screen', 'menu', 'animation', 'environment', 'scene_playlist', 'entity', 'brand', 'announcement', 'weather'], 'location.cloned', request.session.sub)
        : [];
      return { location: await tx.getLocation(created.id), revisions };
    });
    await activity(store, request, { action: 'location.cloned', entity_type: 'location', entity_id: result.location.id, message: `Создана торговая точка «${result.location.name}» по образцу точки #${sourceId}.` });
    notifyRevisions(realtime, result.revisions);
    response.status(201).json(result.location);
  });

  router.put('/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const result = await store.transaction(async (tx) => {
      const record = await tx.updateLocation(id, locationInput(request.body));
      if (!record) throw notFound();
      const ids = screenIds(await tx.listScreensByLocation(record.id));
      const revisions = await tx.markScreenRenderChanged(ids, ['screen'], 'location.updated', request.session.sub);
      return { record, revisions };
    });
    await activity(store, request, { action: 'location.updated', entity_type: 'location', entity_id: result.record.id, message: `Обновлена торговая точка «${result.record.name}».` });
    notifyRevisions(realtime, result.revisions);
    response.json(result.record);
  });

  router.delete('/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const location = await store.getLocation(id);
    if (!location) throw notFound();
    const screens = await store.listScreensByLocation(location.id);
    const affectedScreenIds = screenIds(screens);
    const backgrounds = [];
    for (const screen of screens) {
      const draft = await store.getScreenDraft(screen.id);
      if (draft?.settings?.background_image_url) backgrounds.push(draft.settings.background_image_url);
    }
    if (!await store.deleteLocation(location.id)) throw notFound();
    affectedScreenIds.forEach((screenId) => realtime?.disconnectScreen(screenId));
    for (const url of [...new Set(backgrounds)]) await deleteScreenBackground(url, { store, config });
    await activity(store, request, { action: 'location.deleted', entity_type: 'location', entity_id: location.id, message: `Удалена торговая точка «${location.name}».` });
    response.status(204).end();
  });
  return router;
}
