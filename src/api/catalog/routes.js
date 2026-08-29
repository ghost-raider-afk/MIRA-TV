import express from 'express';
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

export function createCatalogRouter({ store }) {
  const router = express.Router();

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
    const result = Array.isArray(request.body?.rows)
      ? await applyProductsImport(store, request.body.rows)
      : await importProductsCsv(store, request.body?.csv);
    await activity(store, request, {
      action: 'catalog.products.imported',
      entity_type: 'catalog_product',
      entity_id: null,
      message: `Импортирована продукция: создано ${result.created}, обновлено ${result.updated}.`
    });
    response.json(result);
  });
  router.post('/products', async (request, response) => {
    const input = productInput(request.body);
    const product = await catalogWrite(() => store.createProduct(input), 'Продукция', input.name);
    await activity(store, request, { action: 'catalog.product.created', entity_type: 'catalog_product', entity_id: product.id, message: `Добавлена продукция «${product.name}».` });
    response.status(201).json(product);
  });
  router.put('/products/:id', async (request, response) => {
    const input = productInput(request.body);
    const product = await catalogWrite(
      () => store.updateProduct(positiveId(request.params.id, 'id'), input),
      'Продукция',
      input.name
    );
    if (!product) throw notFound();
    await activity(store, request, { action: 'catalog.product.updated', entity_type: 'catalog_product', entity_id: product.id, message: `Обновлена продукция «${product.name}».` });
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
    const input = packagingInput(request.body);
    const packaging = await catalogWrite(
      () => store.updatePackaging(positiveId(request.params.id, 'id'), input),
      'Тара',
      input.name
    );
    if (!packaging) throw notFound();
    await activity(store, request, { action: 'catalog.packaging.updated', entity_type: 'catalog_packaging', entity_id: packaging.id, message: `Обновлена тара «${packaging.name}».` });
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
