import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { catalogItemInput, normaliseCatalogFieldSchema } from '../src/contracts/catalog.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const snackClass = {
  id: 7,
  code: 'snack',
  name: 'Закуска',
  description: 'Закуски',
  pricing_model: 'fixed',
  default_unit: 'порц.',
  resolved_field_schema: [
    { key: 'composition', label: 'Состав', type: 'text', max: 500 },
    { key: 'weight_g', label: 'Вес, г', type: 'number', min: 0, max: 100000, step: 1 },
    { key: 'spiciness', label: 'Острота', type: 'select', options: [
      { value: 'none', label: 'Неострое' }, { value: 'hot', label: 'Очень острое' }
    ] }
  ]
};

test('catalog item contract is class-driven and accepts inherited semantic fields', () => {
  const item = catalogItemInput({
    class_id: 7,
    name: 'Крылья BBQ',
    base_price: '490',
    base_quantity: '1',
    unit: 'порц.',
    attributes: { composition: 'Курица, BBQ', weight_g: 350, spiciness: 'hot' },
    active: true
  }, snackClass);
  assert.equal(item.class_id, 7);
  assert.equal(item.base_price, '490');
  assert.equal(item.attributes.weight_g, 350);
  assert.equal(item.attributes.spiciness, 'hot');
});

test('catalog item contract rejects attributes that are not declared by its class', () => {
  assert.throws(() => catalogItemInput({
    class_id: 7,
    name: 'Крылья BBQ',
    base_price: '490',
    attributes: { abv: 5 }
  }, snackClass), /не предусмотрено классом/);
});

test('catalog field schema rejects duplicate keys and invalid select values', () => {
  assert.throws(() => normaliseCatalogFieldSchema([
    { key: 'weight_g', label: 'Вес', type: 'number' },
    { key: 'weight_g', label: 'Вес ещё раз', type: 'number' }
  ]), /повторно/);
  assert.throws(() => catalogItemInput({
    class_id: 7,
    name: 'Крылья',
    base_price: 400,
    attributes: { spiciness: 'extreme' }
  }, snackClass), /неподдерживаемое значение/);
});

test('universal catalog migration seeds semantic hierarchy and migrates legacy records', async () => {
  const migration = await read('src/db/migrations/universal-catalog.js');
  for (const code of ['beverage', 'beer', 'food', 'snack', 'main_course', 'dessert', 'packaging', 'other']) {
    assert.match(migration, new RegExp(`code: '${code}'`));
  }
  assert.match(migration, /CREATE TABLE IF NOT EXISTS catalog_classes/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS catalog_items/);
  assert.match(migration, /FROM catalog_products p/);
  assert.match(migration, /FROM catalog_packaging p/);
});

test('repository resolves inherited class schema on the server', async () => {
  const repository = await read('src/db/catalog.js');
  assert.match(repository, /WITH RECURSIVE lineage AS/);
  assert.match(repository, /resolved_field_schema:\s*mergeClassSchema\(ordered\)/);
  assert.match(repository, /listCatalogItems/);
  assert.match(repository, /createCatalogItem/);
});

test('catalog API and UI expose one class-based catalog instead of product and packaging tabs', async () => {
  const [routes, html, page] = await Promise.all([
    read('src/api/catalog/routes.js'),
    read('src/web/admin-ui/public/catalog.html'),
    read('src/web/admin-ui/public/js/pages/catalog.js')
  ]);
  assert.match(routes, /router\.get\('\/classes'/);
  assert.match(routes, /router\.get\('\/items'/);
  assert.match(routes, /catalogItemInput/);
  assert.match(html, /id="catalog-class-filter"/);
  assert.match(html, /id="catalog-class-fields-body"/);
  assert.doesNotMatch(html, /catalog-tab-products|catalog-tab-packaging/);
  assert.match(page, /resolved_field_schema/);
  assert.match(page, /API\.catalogClasses/);
  assert.match(page, /API\.catalogItems/);
});
