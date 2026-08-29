import express from 'express';
import { locationInput, positiveId } from '../../contracts/input.js';
import { menuSettingsInput } from '../../contracts/menu-settings.js';
import { activity, conflict, notFound } from '../helpers.js';

export function createLocationsRouter({ store, config }) {
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
    const location = await store.transaction(async (tx) => {
      const source = await tx.getLocation(sourceId);
      if (!source) throw notFound();
      const created = await tx.createLocation(input);
      const sourceScreens = await tx.listScreensByLocation(sourceId);
      for (const sourceScreen of sourceScreens) {
        const [sourceDraft, sourceAnimation] = await Promise.all([
          tx.getScreenDraft(sourceScreen.id),
          tx.getScreenAnimationSettings(sourceScreen.id)
        ]);
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
        const saved = await tx.saveScreenDraft(cloned.id, { rows: structuredClone(sourceDraft.rows || []), settings }, 1);
        if (!saved) throw conflict('Не удалось создать независимую копию мониторов торговой точки.');
        if (sourceAnimation) {
          const applied = await tx.applyAnimationSettingsToScreens([cloned.id], sourceAnimation, request.session.sub);
          if (applied.length !== 1) throw conflict('Не удалось скопировать плейлист монитора торговой точки.');
        }
      }
      return tx.getLocation(created.id);
    });
    await activity(store, request, {
      action: 'location.cloned',
      entity_type: 'location',
      entity_id: location.id,
      message: `Создана торговая точка «${location.name}» по образцу точки #${sourceId}.`
    });
    response.status(201).json(location);
  });

  router.put('/:id', async (request, response) => {
    const record = await store.updateLocation(positiveId(request.params.id, 'id'), locationInput(request.body));
    if (!record) throw notFound();
    await activity(store, request, { action: 'location.updated', entity_type: 'location', entity_id: record.id, message: `Обновлена торговая точка «${record.name}».` });
    response.json(record);
  });
  router.delete('/:id', async (request, response) => {
    const location = await store.getLocation(positiveId(request.params.id, 'id'));
    if (!location) throw notFound();
    if (location.sftp_directory_id) throw conflict('Сначала явно отключите SFTP-доступ точки. Каталог и файлы останутся без изменений.');
    if (!await store.deleteLocation(location.id)) throw notFound();
    await activity(store, request, { action: 'location.deleted', entity_type: 'location', entity_id: location.id, message: `Удалена торговая точка «${location.name}».` });
    response.status(204).end();
  });
  return router;
}
