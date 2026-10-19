import express from 'express';
import { optionalText, positiveId, requireText } from '../../contracts/input.js';
import { buildPlayerState, fullPlayerContext } from '../../services/player-context-service.js';
import { createCatalogChangeProposal } from '../../services/catalog-proposal-service.js';
import { sceneWeatherSettings } from '../../contracts/scene.js';
import { themeWeatherSettings } from '../../contracts/menu-theme.js';
import { hasWeatherCoordinates } from '../../services/weather-service.js';
import { activity, notFound } from '../helpers.js';

async function savedVisibleScreen(store, id, username) {
  const screen = await store.getScreen(id);
  if (!screen || screen.active === false) return null;
  const location = await store.getLocation(screen.location_id);
  if (!location || location.active === false) return null;
  const access=await store.getManagerAccess(username);
  if (!access.all_locations && !access.location_ids.includes(Number(location.id))) return null;
  return screen;
}

export function createManagerViewRouter({ store, config, weatherService }) {
  const router = express.Router();

  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'private, no-store');
    next();
  });

  router.get('/access', async (request, response) => {
    response.json(await store.getManagerAccess(request.session.sub));
  });

  router.get('/overview', async (request, response) => {
    const [locations,screens,access]=await Promise.all([
      store.listLocations(),store.listScreens(),store.getManagerAccess(request.session.sub)
    ]);
    const visibleScreens = screens.filter((screen) => screen.active !== false);
    const groups = locations
      .filter((location) => location.active !== false && (access.all_locations || access.location_ids.includes(Number(location.id))))
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

  router.get('/catalog', async (request, response) => {
    const access=await store.getManagerAccess(request.session.sub);
    if (!access.catalog_enabled) return response.status(403).json({ error:'Доступ к каталогу отключён.' });
    const [products, packaging] = await Promise.all([store.listProducts(), store.listPackaging()]);
    response.json({ products, packaging });
  });

  router.get('/proposals', async (request, response) => {
    const access=await store.getManagerAccess(request.session.sub);
    response.json(await store.listCatalogProposals({
      managerUsername:request.session.sub,
      entityType:access.catalog_enabled ? null : 'message'
    }));
  });

  router.post('/proposals', async (request, response) => {
    const access=await store.getManagerAccess(request.session.sub);
    if (!access.catalog_enabled) return response.status(403).json({ error:'Доступ к каталогу отключён.' });
    const entityId = positiveId(request.body?.entity_id, 'entity_id');
    const proposal = await createCatalogChangeProposal(store, {
      managerUsername:request.session.sub,
      entityType:request.body?.entity_type,
      entityId,
      proposedPayload:request.body?.proposed,
      description:optionalText(request.body?.description, 'Комментарий', { max:2000 })
    });
    if (!proposal) throw notFound('Запись каталога не найдена.');
    await activity(store, request, {
      action:'catalog.proposal.created',
      entity_type:'catalog_change_proposal',
      entity_id:proposal.id,
      message:`Менеджер предложил изменение ${proposal.entity_type === 'product' ? 'продукции' : 'тары'} #${proposal.entity_id}.`
    });
    response.status(201).json(proposal);
  });

  router.post('/proposals/message', async (request, response) => {
    const title=requireText(request.body?.title, 'Тема обращения', { max:120 });
    const description=requireText(request.body?.description, 'Текст обращения', { max:2000 });
    const locationId=request.body?.location_id === null || request.body?.location_id === undefined || request.body?.location_id === ''
      ? null : positiveId(request.body.location_id, 'Торговая точка');
    if (locationId !== null) {
      const access=await store.getManagerAccess(request.session.sub);
      const location=await store.getLocation(locationId);
      if (!location || location.active === false || (!access.all_locations && !access.location_ids.includes(locationId)))
        return response.status(403).json({ error:'Торговая точка недоступна.' });
    }
    const card=await store.createMessageCard({
      managerUsername:request.session.sub,title,description,locationId
    });
    await activity(store,request,{
      action:'manager.card.created',entity_type:'catalog_change_proposal',entity_id:card.id,
      message:`Менеджер создал обращение #${card.id}.`
    });
    response.status(201).json(card);
  });

  router.get('/screens/:id/context', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    if (!await savedVisibleScreen(store, id, request.session.sub)) return response.status(404).json({ error: 'Сохранённый телевизор не найден.' });
    const state = await buildPlayerState(store, { screen_id: id }, config);
    if (!state) return response.status(404).json({ error: 'Телевизор недоступен.' });
    response.json(fullPlayerContext(state));
  });

  router.get('/screens/:id/weather', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    if (!await savedVisibleScreen(store, id, request.session.sub)) return response.status(404).json({ error: 'Сохранённый телевизор не найден.' });
    const draft = await store.getScreenDraft(id);
    const settings = request.query.source === 'theme'
      ? themeWeatherSettings(draft?.settings?.theme, draft?.scene)
      : sceneWeatherSettings(draft?.scene, id);
    if (!settings?.enabled || !hasWeatherCoordinates(settings)) return response.status(204).end();
    const snapshot = await weatherService.getSnapshot(settings);
    response.json({ settings, snapshot });
  });

  return router;
}
