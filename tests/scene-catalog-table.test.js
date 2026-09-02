import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCatalogTableRows,
  catalogTableColumns,
  normaliseTableConfig,
  parseTargetVolumes,
  resolveVolumePrice
} from '../src/web/admin-ui/public/js/scenes/catalog-table.js';

test('table quantity parser accepts comma decimals, de-duplicates and keeps order', () => {
  assert.deepEqual(parseTargetVolumes('0,5; 1; 1,5; 0.5'), [0.5, 1, 1.5]);
});

test('proportional catalog price uses the item base quantity and keeps legacy compatibility', () => {
  assert.equal(resolveVolumePrice({ price_primary: '400.00' }, 0.5, 1), 200);
  assert.equal(resolveVolumePrice({ base_price: '360', base_quantity: '0.9' }, 0.45), 180);
});

test('catalog table rows exclude inactive items by default', () => {
  const rows = buildCatalogTableRows([
    { id: 1, name: 'IPA', class_code: 'beer', class_name: 'Пиво', pricing_model: 'proportional', base_price: '400', base_quantity: '1', unit: 'л', attributes: {}, active: true },
    { id: 2, name: 'Hidden', class_code: 'beer', class_name: 'Пиво', pricing_model: 'proportional', base_price: '500', base_quantity: '1', unit: 'л', attributes: {}, active: false }
  ], { quantities: [0.5] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].values.name, 'IPA');
  assert.match(rows[0].values['price:0.5'], /200/);
});

test('MIRA preset keeps class metadata in the item cell and proportional prices on the right', () => {
  const config = {
    quantities: [0.5, 1],
    price_layout: 'quantities',
    quantity_unit: 'л',
    appearance: { preset: 'clean' }
  };
  const items = [{
    id: 1,
    name: 'Lager',
    class_code: 'beer',
    class_name: 'Пиво',
    pricing_model: 'proportional',
    base_price: '400',
    base_quantity: '1',
    unit: 'л',
    attributes: { producer: 'Brewery', abv: 4.7, beverage_color: 'light', filtration: 'filtered' },
    active: true
  }];
  const columns = catalogTableColumns(config, items);
  assert.deepEqual(columns.map((column) => column.key), ['product', 'price:0.5', 'price:1']);
  const rows = buildCatalogTableRows(items, config);
  assert.equal(rows[0].values.product, 'Lager\nBrewery · 4,7% · светлое · фильтрованное');
  assert.equal(rows[0].values['price:0.5'], '200');
});

test('mixed catalog classes use one universal price column instead of beverage-only volume columns', () => {
  const items = [
    { id: 1, name: 'IPA', class_code: 'beer', class_name: 'Пиво', pricing_model: 'proportional', base_price: '400', base_quantity: '1', unit: 'л', attributes: {}, active: true },
    { id: 2, name: 'Крылья BBQ', class_code: 'snack', class_name: 'Закуска', pricing_model: 'fixed', base_price: '490', base_quantity: '1', unit: 'порц.', attributes: { weight_g: 350, spiciness: 'medium' }, active: true }
  ];
  const config = { price_layout: 'single', appearance: { preset: 'solid' } };
  const columns = catalogTableColumns(config, items);
  assert.deepEqual(columns.map((column) => column.key), ['name', 'metadata', 'price']);
  const rows = buildCatalogTableRows(items, config);
  assert.equal(rows[1].values.metadata, 'острое · 350 г');
  assert.match(rows[1].values.price, /490/);
});

test('table class filter selects one semantic class without a separate catalog', () => {
  const rows = buildCatalogTableRows([
    { id: 1, name: 'IPA', class_code: 'beer', class_name: 'Пиво', pricing_model: 'proportional', base_price: '400', base_quantity: '1', unit: 'л', attributes: {}, active: true },
    { id: 2, name: 'Начос', class_code: 'snack', class_name: 'Закуска', pricing_model: 'fixed', base_price: '250', base_quantity: '1', unit: 'порц.', attributes: {}, active: true }
  ], { class_code: 'snack', price_layout: 'single' });
  assert.deepEqual(rows.map((row) => row.values.name), ['Начос']);
});

test('table config keeps resource bounds and safe quantity defaults', () => {
  const config = normaliseTableConfig({ row_limit: 1000, quantities: ['bad', -1] });
  assert.equal(config.row_limit, 50);
  assert.deepEqual(config.quantities, [0.5, 1, 1.5]);
  assert.deepEqual(config.volumes_l, [0.5, 1, 1.5]);
});
