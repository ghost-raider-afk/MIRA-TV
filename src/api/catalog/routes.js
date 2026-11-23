import express from 'express';
import { packagingInput, positiveId, productInput } from '../../contracts/input.js';
import { applyProductsImport, importProductsCsv, previewProductsImport, productsToCsv } from '../../services/catalog-csv-service.js';
import { markCatalogScreensChanged, notifyCatalogEntityChanged } from '../../services/catalog-render-notifier.js';
import { activity, conflict, notFound } from '../helpers.js';

async function catalogWrite(operation, entity, name) {
  try { return await operation(); }
  catch (error) {
    if (error?.code !== '23505') throw error;
    throw conflict(`${entity} «${name}» уже существует.`);
  }
}

async function withProductActor(store, username, operation) {
  return store.transaction(async (tx) => {
    await tx.setProductHistoryActor(username);
    return operation(tx);
  });
}

function trackedProductImportStore(store, updatedIds, actor) {
  return {
    transaction(run) {
      return withProductActor(store, actor, (tx) => run(new Proxy(tx, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver);
          if (property === 'updateProduct') {
            return async (id, product) => {
              const updated = await value.call(target, id, product);
              if (updated) updatedIds.add(Number(id));
              return updated;
            };
          }
          return typeof value === 'function' ? value.bind(target) : value;
        }
      })));
    }
  };
}

async function notifyProductImportScreens(store, realtime, updatedIds, actor) {
  if (updatedIds.size === 0) return;
  const affected = await store.screensUsingCatalogIds('product', [...updatedIds]);
  await markCatalogScreensChanged(store, realtime, affected, 'catalog.products.imported', actor);
}

export function createCatalogRouter({ store, realtime }) {
  const router = express.Router();

  router.get('/products', async (_request, response) => response.json(await store.listProducts()));
  router.get('/products/:id/history', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    if (!await store.getProduct(id)) throw notFound();
    const cursor = request.query.before ? positiveId(request.query.before, 'before') : null;
    response.json(await store.listProductHistory(id, cursor));
  });
  router.get('/products/:id/usage', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    if (!await store.getProduct(id)) throw notFound();
    response.json(await store.screensUsingCatalog('product', id));
  });
  router.get('/products/export.csv', async (_request, response) => {
    const csv = productsToCsv(await store.listProducts());
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
    response.setHeader('Cache-Control', 'no-store');
    response.send(csv);
  });
  router.post('/products/import/preview', async (request, response) => {
    response.json(await previewProductsImport(store, request.body));
  });
  router.post('/products/import', async (request, response) => {
    const updatedIds = new Set();
    const trackedStore = trackedProductImportStore(store, updatedIds, request.session.sub);
    const result = Array.isArray(request.body?.rows)
      ? await applyProductsImport(trackedStore, request.body.rows)
      : await importProductsCsv(trackedStore, request.body?.csv);
    await activity(store, request, {
      action: 'catalog.products.imported', entity_type: 'catalog_product', entity_id: null,
      message: `Импортирована продукция: создано ${result.created}, обновлено ${result.updated}.`
    });
    await notifyProductImportScreens(store, realtime, updatedIds, request.session.sub);
    response.json(result);
  });
  router.post('/products', async (request, response) => {
    const input = productInput(request.body);
    const product = await catalogWrite(() => withProductActor(store, request.session.sub, (tx) => tx.createProduct(input)), 'Продукция', input.name);
    await activity(store, request, { action: 'catalog.product.created', entity_type: 'catalog_product', entity_id: product.id, message: `Добавлена продукция «${product.name}».` });
    response.status(201).json(product);
  });
  router.put('/products/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const input = productInput(request.body);
    const product = await catalogWrite(() => withProductActor(store, request.session.sub, (tx) => tx.updateProduct(id, input)), 'Продукция', input.name);
    if (!product) throw notFound();
    await activity(store, request, { action: 'catalog.product.updated', entity_type: 'catalog_product', entity_id: product.id, message: `Обновлена продукция «${product.name}».` });
    await notifyCatalogEntityChanged(store, realtime, 'product', id, 'catalog.product.updated', request.session.sub);
    response.json(product);
  });
  router.post('/products/:id/archive', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const product = await store.getProduct(id);
    if (!product) throw notFound();
    if (product.archived_at) throw conflict('Продукция уже архивирована.');
    const updated = await withProductActor(store, request.session.sub, (tx) => tx.archiveProduct(id, request.session.sub));
    if (!updated) throw conflict('Продукция изменена другим пользователем.');
    await activity(store, request, { action: 'catalog.product.archived', entity_type: 'catalog_product', entity_id: id, message: `Архивирована продукция «${product.name}».` });
    response.json(await store.getProduct(id));
  });
  router.post('/products/:id/unarchive', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const product = await store.getProduct(id);
    if (!product) throw notFound();
    if (!product.archived_at) throw conflict('Продукция не архивирована.');
    const updated = await withProductActor(store, request.session.sub, (tx) => tx.unarchiveProduct(id));
    if (!updated) throw conflict('Продукция изменена другим пользователем.');
    await activity(store, request, { action: 'catalog.product.unarchived', entity_type: 'catalog_product', entity_id: id, message: `Возвращена из архива продукция «${product.name}».` });
    response.json(await store.getProduct(id));
  });
  router.delete('/products/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const product = await store.getProduct(id);
    if (!product) throw notFound();
    const affected = await store.screensUsingCatalog('product', id);
    if (affected.length) throw conflict('Продукция используется в меню мониторов и не может быть удалена.', affected);
    if (!await withProductActor(store, request.session.sub, (tx) => tx.deleteProduct(id, request.session.sub))) throw notFound();
    await activity(store, request, { action: 'catalog.product.deleted', entity_type: 'catalog_product', entity_id: id, message: `Продукция «${product.name}» перемещена в корзину.` });
    response.status(204).end();
  });

  router.get('/packaging', async (_request, response) => response.json(await store.listPackaging()));
  router.post('/packaging', async (request, response) => {
    const input = packagingInput(request.body);
    const packaging = await catalogWrite(() => store.createPackaging(input), 'Тара', input.name);
    await activity(store, request, { action: 'catalog.packaging.created', entity_type: 'catalog_packaging', entity_id: packaging.id, message: `Добавлена тара «${packaging.name}».` });
    response.status(201).json(packaging);
  });
  router.put('/packaging/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const input = packagingInput(request.body);
    const packaging = await catalogWrite(() => store.updatePackaging(id, input), 'Тара', input.name);
    if (!packaging) throw notFound();
    await activity(store, request, { action: 'catalog.packaging.updated', entity_type: 'catalog_packaging', entity_id: packaging.id, message: `Обновлена тара «${packaging.name}».` });
    await notifyCatalogEntityChanged(store, realtime, 'packaging', id, 'catalog.packaging.updated', request.session.sub);
    response.json(packaging);
  });
  router.delete('/packaging/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const packaging = await store.getPackaging(id);
    if (!packaging) throw notFound();
    const affected = await store.screensUsingCatalog('packaging', id);
    if (affected.length) throw conflict('Тара используется в меню мониторов и не может быть удалена.', affected);
    await store.deletePackaging(id);
    await activity(store, request, { action: 'catalog.packaging.deleted', entity_type: 'catalog_packaging', entity_id: id, message: `Удалена тара «${packaging.name}».` });
    response.status(204).end();
  });

  return router;
}
