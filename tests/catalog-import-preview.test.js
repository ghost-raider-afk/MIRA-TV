import assert from 'node:assert/strict';
import test from 'node:test';
import { applyProductsImport, previewProductsImport } from '../src/services/catalog-csv-service.js';
import { ConflictError } from '../src/shared/errors.js';

const EXISTING = Object.freeze({
  id: 7,
  name: 'Старое название',
  producer: 'Пивоварня',
  characteristics: '',
  strength: '4,5%',
  price_primary: '240',
  price_secondary: '360',
  alcoholic: true,
  beverage_color: 'light',
  filtration: 'filtered',
  active: true
});

test('catalog import preview classifies rows, reports diffs and keeps unknown IDs editable', async () => {
  const store = { async listProducts() { return [EXISTING]; } };
  const csv = [
    'ID;Название;Производитель;Крепость;Цена 1 л;Алкогольная;Цвет напитка;Фильтрация;Активна',
    '7;Новое название;Пивоварня;4,5%;250;да;светлый;фильтрованное;да',
    ';Новая позиция;;;100;нет;;;да',
    '999;Ошибочная позиция;;;120;нет;;;да'
  ].join('\r\n');

  const preview = await previewProductsImport(store, { csv });
  assert.deepEqual(preview.summary, { total: 3, new: 1, changed: 1, unchanged: 0, error: 1, excluded: 0 });
  assert.equal(preview.canApply, false);
  assert.equal(preview.rows[0].status, 'changed');
  assert.ok(preview.rows[0].changes.some((item) => item.field === 'name' && item.before === 'Старое название' && item.after === 'Новое название'));
  assert.equal(preview.rows[0].normalized.price_secondary, '375');
  assert.equal(preview.rows[1].status, 'new');
  assert.equal(preview.rows[2].status, 'error');
  assert.match(preview.rows[2].errors.find((item) => item.field === 'id').message, /ID 999 не найдена/);

  const correctedRows = preview.rows.map((row) => ({
    key: row.key,
    line: row.line,
    excluded: row.id === 999,
    values: row.values
  }));
  const corrected = await previewProductsImport(store, { rows: correctedRows });
  assert.deepEqual(corrected.summary, { total: 3, new: 1, changed: 1, unchanged: 0, error: 0, excluded: 1 });
  assert.equal(corrected.canApply, true);
});

test('catalog import preview revalidates edited cells with the regular product rules', async () => {
  const store = { async listProducts() { return [EXISTING]; } };
  const invalid = await previewProductsImport(store, { rows: [{
    key: 'row-1', line: 2, values: { id: '7', name: 'Исправляемая', price_primary: 'abc', alcoholic: true, beverage_color: 'light', filtration: 'filtered', active: true }
  }] });
  assert.equal(invalid.rows[0].status, 'error');
  assert.equal(invalid.rows[0].errors[0].field, 'price_primary');

  const fixedRows = invalid.rows.map((row) => ({ ...row, values: { ...row.values, price_primary: '300' } }));
  const fixed = await previewProductsImport(store, { rows: fixedRows });
  assert.equal(fixed.rows[0].status, 'changed');
  assert.equal(fixed.rows[0].normalized.price_primary, '300');
  assert.equal(fixed.rows[0].normalized.price_secondary, '450');
});

test('catalog import apply validates again inside one transaction and skips unchanged or excluded rows', async () => {
  const calls = [];
  let transactions = 0;
  const second = { ...EXISTING, id: 8, name: 'Без изменений' };
  const store = {
    async transaction(run) {
      transactions += 1;
      return run({
        async listProducts() { return [EXISTING, second]; },
        async updateProduct(id, product) { calls.push(['update', id, product.name]); return { id, ...product }; },
        async createProduct(product) { calls.push(['create', product.name]); return { id: 9, ...product }; }
      });
    }
  };

  const rows = [
    { key: 'changed', line: 2, values: { id: '7', name: 'Обновлено', producer: 'Пивоварня', characteristics: '', strength: '4,5%', price_primary: '250', alcoholic: true, beverage_color: 'light', filtration: 'filtered', active: true } },
    { key: 'same', line: 3, values: { id: '8', name: second.name, producer: second.producer, characteristics: second.characteristics, strength: second.strength, price_primary: second.price_primary, alcoholic: second.alcoholic, beverage_color: second.beverage_color, filtration: second.filtration, active: second.active } },
    { key: 'new', line: 4, values: { id: '', name: 'Новая', producer: '', characteristics: '', strength: '', price_primary: '100', alcoholic: false, beverage_color: 'none', filtration: 'none', active: true } },
    { key: 'excluded', line: 5, excluded: true, values: { id: '999', name: '', price_primary: '' } }
  ];

  const result = await applyProductsImport(store, rows);
  assert.equal(transactions, 1);
  assert.deepEqual(result, { created: 1, updated: 1, unchanged: 1, excluded: 1, total: 2 });
  assert.deepEqual(calls, [['update', 7, 'Обновлено'], ['create', 'Новая']]);
});

test('catalog import duplicate identifies the exact row and product name', async () => {
  const duplicate = Object.assign(new Error('duplicate key'), { code: '23505' });
  const store = {
    async transaction(work) {
      return work({
        async listProducts() { return []; },
        async createProduct() { throw duplicate; },
        async updateProduct() { throw new Error('unexpected update'); }
      });
    }
  };

  await assert.rejects(
    () => applyProductsImport(store, [{
      key: 'duplicate', line: 7,
      values: { id: '', name: 'Повтор из CSV', price_primary: '240', alcoholic: false, beverage_color: 'none', filtration: 'none', active: true }
    }]),
    (error) => error instanceof ConflictError
      && error.message === 'Строка 7: продукция «Повтор из CSV» уже существует. Укажите ID существующей записи для обновления или измените название.'
  );
});
