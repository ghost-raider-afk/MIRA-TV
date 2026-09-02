import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { productInput } from '../src/contracts/input.js';
import { productsFromCsv, productsToCsv } from '../src/services/catalog-csv-service.js';

const COLORS = [
  ['white', 'белое'],
  ['semi_dark', 'полутёмное'],
  ['amber', 'янтарное'],
  ['red', 'красное']
];

function product(beverageColor) {
  return productInput({
    name: 'Тест',
    price_primary: '100',
    beverage_color: beverageColor
  });
}

test('legacy product contract accepts all extended beverage colors', () => {
  for (const [value] of COLORS) assert.equal(product(value).beverage_color, value);
  assert.throws(() => product('purple'), /корректные параметры напитка/);
});

test('extended beverage colors round-trip through legacy product CSV', () => {
  for (const [value, label] of COLORS) {
    const csv = productsToCsv([{ id: 1, ...product(value) }]);
    assert.match(csv, new RegExp(`;${label};;да`));
    const [entry] = productsFromCsv(csv);
    assert.equal(entry.product.beverage_color, value);
  }
  assert.equal(productsFromCsv('Название;Цена 1 л;Цвет напитка\nТест;100;полутемное\n')[0].product.beverage_color, 'semi_dark');
});

test('beer class schema owns the complete beverage color list instead of the universal form', async () => {
  const migration = await readFile(new URL('../src/db/migrations/universal-catalog.js', import.meta.url), 'utf8');
  assert.match(migration, /code:\s*'beer'/);
  assert.match(migration, /key:\s*'beverage_color'/);
  for (const [value] of COLORS) assert.match(migration, new RegExp(`value: '${value}'`));

  const html = await readFile(new URL('../src/web/admin-ui/public/catalog.html', import.meta.url), 'utf8');
  assert.match(html, /id="catalog-class-fields-body"/);
  assert.doesNotMatch(html, /id="product-beverage-color"/);
});
