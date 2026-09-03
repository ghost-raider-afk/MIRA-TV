import express from 'express';
import { catalogViewInput } from '../../contracts/catalog-view.js';
import { positiveId } from '../../contracts/input.js';
import { activity, conflict, notFound } from '../helpers.js';

async function ensureCatalogItemsExist(store, itemIds) {
  if (!itemIds.length) return;
  const rows = await store.listCatalogItemsByIds(itemIds);
  const found = new Set(rows.map((item) => Number(item.id)));
  const missing = itemIds.filter((id) => !found.has(id));
  if (missing.length) throw notFound('Часть позиций подборки больше не существует в каталоге.');
}

async function uniqueView(operation, name) {
  try {
    return await operation();
  } catch (error) {
    if (error?.code !== '23505') throw error;
    throw conflict(`Подборка меню «${name}» уже существует.`);
  }
}

export function createCatalogViewsRouter({ store, realtime }) {
  const router = express.Router();

  router.get('/', async (_request, response) => {
    response.json(await store.listCatalogViews({ activeOnly: true }));
  });

  router.get('/:id', async (request, response) => {
    const view = await store.getCatalogView(positiveId(request.params.id, 'id'));
    if (!view || view.active === false) throw notFound('Подборка меню не найдена.');
    response.json(view);
  });

  router.post('/', async (request, response) => {
    const input = catalogViewInput(request.body);
    await ensureCatalogItemsExist(store, input.item_ids);
    const view = await uniqueView(() => store.transaction((tx) => tx.createCatalogView(input)), input.name);
    await activity(store, request, {
      action: 'catalog.view.created', entity_type: 'catalog_view', entity_id: view.id,
      message: `Создана подборка меню «${view.name}» (${view.item_ids.length} позиций).`
    });
    realtime?.notifyAll?.();
    response.status(201).json(view);
  });

  router.put('/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const input = catalogViewInput(request.body);
    await ensureCatalogItemsExist(store, input.item_ids);
    const view = await uniqueView(() => store.transaction((tx) => tx.updateCatalogView(id, input)), input.name);
    if (!view) throw notFound('Подборка меню не найдена.');
    await activity(store, request, {
      action: 'catalog.view.updated', entity_type: 'catalog_view', entity_id: view.id,
      message: `Обновлена подборка меню «${view.name}» (${view.item_ids.length} позиций).`
    });
    realtime?.notifyAll?.();
    response.json(view);
  });

  return router;
}
