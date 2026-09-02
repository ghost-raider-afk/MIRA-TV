import express from 'express';
import { catalogItemInput } from '../../contracts/catalog.js';
import { packagingInput, positiveId, productInput } from '../../contracts/input.js';
import { applyProductsImport, importProductsCsv, previewProductsImport, productsToCsv } from '../../services/catalog-csv-service.js';
import { activity, conflict, notFound } from '../helpers.js';

async function catalogWrite(operation, entity, name) {
  try {
    return await operation();
  } catch (error) {
    if (error?.code !== '23505') throw error;
    throw conflict(`${entity} «${name}» уже существует.`);
  }
}

function screenIds(rows) {
  return [...new Set((rows || []).map((row) => Number(row.screen_id)).filter(Number.isSafeInteger))];
}

function trackedProductImportStore(store, updatedIds) {
  return {
    transaction(run) {
      return store.transaction((tx) => run(new Proxy(tx, {
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

async function notifyProductImportScreens(store, realtime, updatedIds) {
  if (!realtime || updatedIds.size === 0) return;
  const affected = await store.screensUsingCatalogIds('product', [...updatedIds]);
  realtime.notifyScreens(screenIds(affected));
}

async function resolvedCatalogClasses(store) {
  const classes = await store.listCatalogClasses();
  return Promise.all(classes.map((item) => store.getCatalogClassWithSchema(item.id)));
}

export function createCatalogRouter({ store, realtime }) {
  const router = express.Router();

  router.get('/classes', async (_request, response) => response.json(await resolvedCatalogClasses(store)));
  router.get('/items', async (_request, response) => response.json(await store.listCatalogItems()));
  router.get('/items/:id', async (request, response) => {
    const item = await store.getCatalogItem(positiveId(request.params.id, 'id'));
    if (!item) throw notFound();
    response.json(item);
  });
  router.post('/items', async (request, response) => {
    const classId = positiveId(request.body?.class_id, 'class_id');
    const catalogClass = await store.getCatalogClassWithSchema(classId);
    if (!catalogClass || catalogClass.active === false) throw notFound('Класс каталога не найден.');
    const input = catalogItemInput(request.body, catalogClass);
    const item = await catalogWrite(() => store.createCatalogItem(input), 'Позиция', input.name);
    await activity(store, request, {
      action: 'catalog.item.created',
      entity_type: 'catalog_item',
      entity_id: item.id,
      message: `Добавлена позиция каталога «${item.name}» (${item.class_name}).`
    });
    response.status(201).json(item);
  });
  router.put('/items/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const classId = positiveId(request.body?.class_id, 'class_id');
    const catalogClass = await store.getCatalogClassWithSchema(classId);
    if (!catalogClass || catalogClass.active === false) throw notFound('Класс каталога не найден.');
    const input = catalogItemInput(request.body, catalogClass);
    const item = await catalogWrite(() => store.updateCatalogItem(id, input), 'Позиция', input.name);
    if (!item) throw notFound();
    await activity(store, request, {
      action: 'catalog.item.updated',
      entity_type: 'catalog_item',
      entity_id: item.id,
      message: `Обновлена позиция каталога «${item.name}» (${item.class_name}).`
    });
    realtime?.notifyAll?.();
    response.json(item);
  });
  router.delete('/items/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const item = await store.getCatalogItem(id);
    if (!item) throw notFound();
    await store.deleteCatalogItem(id);
    await activity(store, request, {
      action: 'catalog.item.deleted',
      entity_type: 'catalog_item',
      entity_id: id,
      message: `Удалена позиция каталога «${item.name}».`
    });
    realtime?.notifyAll?.();
    response.status(204).end();
  });

  // Legacy API remains during the transition so existing menu drafts and CSV tooling stay readable.
  router.get('/products', async (_request, response) => response.json(await store.listProducts()));
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
    const trackedStore = trackedProductImportStore(store, updatedIds);
    const result = Array.isArray(request.body?.rows)
      ? await applyProductsImport(trackedStore, request.body.rows)
      : await importProductsCsv(trackedStore, request.body?.csv);
    await activity(store, request, {
      action: 'catalog.products.imported',
      entity_type: 'catalog_product',
      entity_id: null,
      message: `Импортирована продукция: создано ${result.created}, обновлено ${result.updated}.`
    });
    await notifyProductImportScreens(store, realtime, updatedIds);
    response.json(result);
  });
  router.post('/products', async (request, response) => {
    const input = productInput(request.body);
    const product = await catalogWrite(() => store.createProduct(input), 'Продукция', input.name);
    await activity(store, request, { action: 'catalog.product.created', entity_type: 'catalog_product', entity_id: product.id, message: `Добавлена продукция «${product.name}».` });
    response.status(201).json(product);
  });
  router.put('/products/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const input = productInput(request.body);
    const product = await catalogWrite(() => store.updateProduct(id, input), 'Продукция', input.name);
    if (!product) throw notFound();
    const affected = await store.screensUsingCatalog('product', id);
    await activity(store, request, { action: 'catalog.product.updated', entity_type: 'catalog_product', entity_id: product.id, message: `Обновлена продукция «${product.name}».` });
    realtime?.notifyScreens(screenIds(affected));
    response.json(product);
  });
  router.delete('/products/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const product = await store.getProduct(id);
    if (!product) throw notFound();
    const affected = await store.screensUsingCatalog('product', id);
    if (affected.length) throw conflict('Продукция используется в меню мониторов и не может быть удалена.', affected);
    await store.deleteProduct(id);
    await activity(store, request, { action: 'catalog.product.deleted', entity_type: 'catalog_product', entity_id: id, message: `Удалена продукция «${product.name}».` });
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
    const affected = await store.screensUsingCatalog('packaging', id);
    await activity(store, request, { action: 'catalog.packaging.updated', entity_type: 'catalog_packaging', entity_id: packaging.id, message: `Обновлена тара «${packaging.name}».` });
    realtime?.notifyScreens(screenIds(affected));
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
