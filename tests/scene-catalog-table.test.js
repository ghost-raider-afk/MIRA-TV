import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCatalogTableRows,
  catalogTableColumns,
  normaliseTableConfig,
  parseTargetVolumes,
  resolveVolumePrice
} from '../src/web/admin-ui/public/js/scenes/catalog-table.js';

test('table volume parser accepts comma decimals, de-duplicates and keeps order', () => {
  assert.deepEqual(parseTargetVolumes('0,5; 1; 1,5; 0.5'), [0.5, 1, 1.5]);
});

test('volume price is proportional to the base 1 litre price', () => {
  const product = { price_primary: '400.00' };
  assert.equal(resolveVolumePrice(product, 0.5, 1), 200);
  assert.equal(resolveVolumePrice(product, 1.5, 1), 600);
});

test('catalog table rows exclude inactive products by default', () => {
  const rows = buildCatalogTableRows([
    { id: 1, name: 'IPA', price_primary: '400', active: true },
    { id: 2, name: 'Hidden', price_primary: '500', active: false }
  ], { volumes_l: [0.5] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].values.name, 'IPA');
  assert.match(rows[0].values['price:0.5'], /200/);
});

test('MIRA-TV preset keeps product metadata in the product cell and prices on the right', () => {
  const config = {
    volumes_l: [0.5, 1],
    show_producer: true,
    show_strength: true,
    show_color: true,
    show_filtration: true,
    appearance: { preset: 'clean' }
  };
  const columns = catalogTableColumns(config);
  assert.deepEqual(columns.map((column) => column.key), ['product', 'price:0.5', 'price:1']);

  const rows = buildCatalogTableRows([{
    id: 1,
    name: 'Lager',
    producer: 'Brewery',
    strength: '4.7°',
    beverage_color: 'light',
    filtration: 'filtered',
    price_primary: '400',
    active: true
  }], config);
  assert.equal(rows[0].values.product, 'Lager\nBrewery · 4.7% · светлое · фильтрованное');
  assert.equal(rows[0].values['price:0.5'], '200');
});

test('spreadsheet presets expose optional product properties as real columns', () => {
  const columns = catalogTableColumns({
    volumes_l: [0.33, 1],
    show_producer: true,
    show_strength: true,
    show_color: true,
    show_filtration: true,
    appearance: { preset: 'solid' }
  });
  assert.deepEqual(columns.map((column) => column.key), [
    'name', 'producer', 'strength', 'beverage_color', 'filtration', 'price:0.33', 'price:1'
  ]);
});

test('table config clamps rows and falls back to safe volumes', () => {
  const config = normaliseTableConfig({ row_limit: 1000, volumes_l: ['bad', -1] });
  assert.equal(config.row_limit, 50);
  assert.deepEqual(config.volumes_l, [0.5, 1, 1.5]);
});
