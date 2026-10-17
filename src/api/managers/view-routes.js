import express from 'express';
import { positiveId } from '../../contracts/input.js';
import { buildPlayerState, fullPlayerContext } from '../../services/player-context-service.js';
import { sceneWeatherSettings } from '../../contracts/scene.js';
import {
  catalogChangedFields,
  catalogEntitySnapshot,
  catalogProposalInput,
  getCatalogEntity
} from '../../services/catalog-change-service.js';
import { activity, conflict, notFound } from '../helpers.js';

async function savedVisibleScreen(store, id) {
  const screen = await store.getScreen(id);
  if (!screen || screen.active === false) return null;
  const location = await store.getLocation(screen.location_id);
  if (!location || location.active === false) return null;
  return screen;
}

export function createManagerViewRouter({ store, config, weatherService }) {
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

  router.get('/catalog', async (_request, response) => {
    const [products, packaging] = await Promise.all([store.listProducts(), store.listPackaging()]);
    response.json({ products, packaging });
  });

  router.get('/catalog/requests', async (request, response) => {
    response.json(await store.listCatalogChangeRequests({ requesterUsername:request.session.sub, limit:200 }));
  });

  router.post('/catalog/requests', async (request, response) => {
    const entityType = request.body?.entity_type === 'packaging' ? 'packaging' : request.body?.entity_type === 'product' ? 'product' : '';
    if (!entityType) throw notFound('Тип записи каталога не найден.');
    const entityId = positiveId(request.body?.entity_id, 'entity_id');
    const current = await getCatalogEntity(store, entityType, entityId);
    if (!current) throw notFound('Запись каталога не найдена.');
    const before = catalogEntitySnapshot(entityType, current);
    const proposed = catalogProposalInput(entityType, request.body?.proposed || {});
    if (!catalogChangedFields(entityType, before, proposed).length) throw conflict('Изменений для согласования нет.');

    let changeRequest;
    try {
      changeRequest = await store.createCatalogChangeRequest({
        requesterUsername:request.session.sub,
        entityType,
        entityId,
        operation:'update',
        before,
        proposed,
        baseUpdatedAt:current.updated_at
      });
    } catch (error) {
      if (error?.code !== '23505') throw error;
      throw conflict('Для этой позиции уже есть ваше изменение, ожидающее согласования.');
    }

    await activity(store, request, {
      action:'catalog.change.requested',
      entity_type:`catalog_${entityType}`,
      entity_id:entityId,
      message:`Менеджер предложил изменение «${before.name || entityId}».`,
      metadata:{ change_request_id:changeRequest.id }
    });
    response.status(201).json(changeRequest);
  });

  return router;
}
