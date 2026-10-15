import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { productInput } from '../src/contracts/input.js';
import { migrateCatalogProductAddress } from '../src/db/migrations/catalog-product-address.js';

test('catalog product address is optional structured data', () => {
  const product = productInput({ name:'Товар', producer:'Завод', address:'  Хабаровский край  ', price_primary:'100' });
  assert.equal(product.address, 'Хабаровский край');
  assert.equal(product.price_secondary, '150');
});

test('catalog product address migration is additive and registered after historical migrations', async () => {
  const calls = [];
  await migrateCatalogProductAddress({ async query(sql) { calls.push(sql); } });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT ''/);
  const indexSource = await readFile(new URL('../src/db/index.js', import.meta.url), 'utf8');
  assert.match(indexSource, /034-catalog-product-address/);
});

test('catalog UI exposes address separately from producer', async () => {
  const html = await readFile(new URL('../src/web/admin-ui/public/catalog.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../src/web/admin-ui/public/js/pages/catalog.js', import.meta.url), 'utf8');
  assert.match(html, /id="product-address"/);
  assert.match(html, /<th>Производитель<\/th><th>Адрес<\/th>/);
  assert.match(js, /address: element\('product-address'\)\.value/);
});
