import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogTableRows, normaliseTableConfig } from '../src/web/admin-ui/public/js/scenes/catalog-table.js';

const items = [
  { id: 1, name: 'Первый', class_code: 'beer', class_name: 'Пиво', base_price: '100', base_quantity: '1', unit: 'л', pricing_model: 'fixed', active: true, attributes: {} },
  { id: 2, name: 'Второй', class_code: 'snack', class_name: 'Закуска', base_price: '200', base_quantity: '1', unit: 'шт', pricing_model: 'fixed', active: true, attributes: {} },
  { id: 3, name: 'Третий', class_code: 'beer', class_name: 'Пиво', base_price: '300', base_quantity: '1', unit: 'л', pricing_model: 'fixed', active: true, attributes: {} }
];

test('menu view renders only selected catalog ids and respects manual order', () => {
  const rows = buildCatalogTableRows(items, { view_id: 9, item_ids: [3, 1], class_code: '', price_layout: 'single', row_limit: 50 });
  assert.deepEqual(rows.map((row) => row.id), [3, 1]);
});

test('catalog class filter remains available together with a saved view', () => {
  const rows = buildCatalogTableRows(items, { view_id: 9, item_ids: [2, 3, 1], class_code: 'beer', price_layout: 'single', row_limit: 50 });
  assert.deepEqual(rows.map((row) => row.id), [3, 1]);
  assert.equal(normaliseTableConfig({ view_id: 9, item_ids: [3, 1] }).view_id, 9);
});
