import assert from 'node:assert/strict';
import test from 'node:test';
import { importProductsCsv, productsFromCsv, productsToCsv } from '../src/services/catalog-csv-service.js';

const PRODUCT = Object.freeze({
  id: 7,
  name: 'СНЕЖНЫЙ ЭЛЬ; особый',
  producer: 'ООО "Пивоварня"',
  characteristics: 'светлое, фильтрованное',
  strength: '4,5%',
  price_primary: '240',
  price_secondary: '360',
  alcoholic: true,
  beverage_color: 'light',
  filtration: 'filtered',
  active: true
});

test('product CSV export marks 1.5 l price as calculated and round-trips editable fields', () => {
  const csv = productsToCsv([PRODUCT]);
  assert.ok(csv.startsWith('\uFEFFID;Название;Производитель;'));
  assert.match(csv, /Цена 1,5 л \(расчётная\)/);
  assert.match(csv, /"СНЕЖНЫЙ ЭЛЬ; особый"/);
  assert.match(csv, /"ООО ""Пивоварня"""/);
  assert.match(csv, /;240;360;да;светлый;фильтрованное;да/);

  const [entry] = productsFromCsv(csv);
  assert.equal(entry.id, 7);
  assert.deepEqual(entry.product, {
    name: PRODUCT.name,
    producer: PRODUCT.producer,
    characteristics: PRODUCT.characteristics,
    strength: PRODUCT.strength,
    price_primary: '240',
    price_secondary: '360',
    alcoholic: true,
    beverage_color: 'light',
    filtration: 'filtered',
    active: true
  });
});

test('secondary CSV price is display-only and cannot override the calculated value', () => {
  const [entry] = productsFromCsv('Название;Цена 1 л;Цена 1,5 л (расчётная)\r\nТест;200;999999\r\n');
  assert.equal(entry.product.price_primary, '200');
  assert.equal(entry.product.price_secondary, '300');

  const [legacy] = productsFromCsv('Название;Цена 1 л;Цена 1,5 л\r\nТест;100;1\r\n');
  assert.equal(legacy.product.price_secondary, '150');
});

test('product CSV import accepts new rows without ID and validates required columns', () => {
  const [entry] = productsFromCsv('Название;Цена 1 л;Активна\r\nНовая позиция;199,50;нет\r\n');
  assert.equal(entry.id, null);
  assert.equal(entry.product.name, 'Новая позиция');
  assert.equal(entry.product.price_primary, '199.50');
  assert.equal(entry.product.price_secondary, '299.25');
  assert.equal(entry.product.active, false);

  assert.throws(() => productsFromCsv('Название;Производитель\nТест;Завод\n'), /отсутствует столбец «Цена 1 л»/);
});

test('product CSV rejects duplicate IDs before changing the database', () => {
  const csv = 'ID;Название;Цена 1 л\n4;Один;100\n4;Два;200\n';
  assert.throws(() => productsFromCsv(csv), /ID 4 встречается в CSV несколько раз/);
});

test('product CSV import updates existing IDs, creates blank IDs and uses one transaction', async () => {
  const calls = [];
  let transactions = 0;
  const store = {
    async transaction(run) {
      transactions += 1;
      return run({
        async listProducts() { return [PRODUCT]; },
        async updateProduct(id, product) { calls.push(['update', id, product.name]); return { id, ...product }; },
        async createProduct(product) { calls.push(['create', product.name]); return { id: 8, ...product }; }
      });
    }
  };
  const csv = 'ID;Название;Цена 1 л\n7;Обновлённая;250\n;Новая;100\n';
  const result = await importProductsCsv(store, csv);
  assert.deepEqual(result, { created: 1, updated: 1, total: 2 });
  assert.equal(transactions, 1);
  assert.deepEqual(calls, [['update', 7, 'Обновлённая'], ['create', 'Новая']]);
});

test('unknown CSV ID is rejected instead of silently changing product identity', async () => {
  const store = {
    async transaction(run) {
      return run({
        async listProducts() { return []; },
        async updateProduct() { throw new Error('must not update'); },
        async createProduct() { throw new Error('must not create'); }
      });
    }
  };
  await assert.rejects(importProductsCsv(store, 'ID;Название;Цена 1 л\n999;Тест;100\n'), /ID 999 не найдена/);
});
