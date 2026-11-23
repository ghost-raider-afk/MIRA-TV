import express from 'express';
import { locationInput, positiveId } from '../../contracts/input.js';
import { menuSettingsInput } from '../../contracts/menu-settings.js';
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
        const sourceDraft = await tx.getScreenDraft(sourceScreen.id);
        const cloned = await tx.createScreen({
          location_id: created.id,
          name: sourceScreen.name,
          resolution: sourceScreen.resolution,
          status: 'draft',
          active: sourceScreen.active !== false
        });
        const settings = menuSettingsInput(sourceDraft.settings || {}, {
          allowBackgroundImage: true,
          maxWidth: config.screenMaxWidth,
          maxHeight: config.screenMaxHeight
        });
        const saved = await tx.saveScreenDraft(cloned.id, {
          rows: structuredClone(sourceDraft.rows || []),
          settings,
          scene: structuredClone(sourceDraft.scene || { version: 1, elements: [] })
        }, 1);
        if (!saved) throw conflict('Не удалось создать независимую копию мониторов торговой точки.');
        clonedIds.push(cloned.id);
      }
      const revisions = clonedIds.length
        ? await tx.markScreenRenderChanged(clonedIds, ['screen', 'menu', 'scene'], 'location.cloned', request.session.sub)
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
    if (!await store.deleteLocation(location.id, request.session.sub)) throw notFound();
    affectedScreenIds.forEach((screenId) => realtime?.disconnectScreen(screenId));
    // Retain nested TVs, drafts, assets and device bindings for restoration.
    await activity(store, request, { action: 'location.deleted', entity_type: 'location', entity_id: location.id, message: `Торговая точка «${location.name}» перемещена в корзину.` });
    response.status(204).end();
  });
  return router;
}