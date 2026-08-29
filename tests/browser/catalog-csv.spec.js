import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/signin.html');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name: /войти/i }).click()
  ]);
}

async function waitForRouteReady(page) {
  await expect(page.locator('.main-content')).toHaveAttribute('data-route-state', 'ready');
}

function encodeWindows1251(text) {
  const table = new Map();
  for (let code = 0xC0; code <= 0xFF; code += 1) table.set(String.fromCharCode(0x0410 + code - 0xC0), code);
  table.set('Ё', 0xA8);
  table.set('ё', 0xB8);
  return Buffer.from([...text].map((char) => {
    const code = char.charCodeAt(0);
    if (code < 0x80) return code;
    if (table.has(char)) return table.get(char);
    throw new Error(`Unsupported Windows-1251 test character: ${char}`);
  }));
}

test('products can be previewed, corrected and applied as one round-trip CSV', async ({ page }) => {
  await login(page);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const originalName = `CSV ${suffix}`;
  const updatedName = `CSV UPDATED ${suffix}`;
  const newName = `CSV NEW ${suffix}`;
  const createResponse = await page.request.post('/api/catalog/products', {
    data: {
      name: originalName,
      producer: 'Browser CI',
      characteristics: 'светлое; тест',
      strength: '4,5%',
      price_primary: '240',
      alcoholic: true,
      beverage_color: 'light',
      filtration: 'filtered',
      active: true
    }
  });
  expect(createResponse.status()).toBe(201);
  const product = await createResponse.json();

  await page.goto('/catalog.html');
  await waitForRouteReady(page);
  await expect(page.getByRole('button', { name: 'Загрузить в базу' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Выгрузить из базы' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Выгрузить из базы' }).click();
  const download = await downloadPromise;
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv).toContain('\uFEFFID;Название;Производитель;');
  expect(csv).toContain('Цена 1,5 л (расчётная)');
  expect(csv).toContain(originalName);

  const importCsv = `\uFEFFID;Название;Производитель;Характеристики;Крепость;Цена 1 л;Цена 1,5 л (расчётная);Алкогольная;Цвет напитка;Фильтрация;Активна\r\n${product.id};${updatedName};Browser CI;после импорта;4,5%;250;999999;да;светлый;фильтрованное;да\r\n;${newName};Новый;создано импортом;;ошибка;999999;нет;;;да\r\n`;
  await page.locator('#product-import-file').setInputFiles({
    name: 'products.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(importCsv, 'utf8')
  });

  const preview = page.locator('#product-import-preview');
  await expect(preview).toBeVisible();
  await expect(preview.locator('[data-import-count="changed"]')).toHaveText('1');
  await expect(preview.locator('[data-import-count="new"]')).toHaveText('0');
  await expect(preview.locator('[data-import-count="error"]')).toHaveText('1');
  await expect(page.locator('#product-import-apply')).toBeDisabled();

  const changedRow = page.locator('#product-import-body tr').first();
  await expect(changedRow.locator('.catalog-import-calculated')).toHaveText('375 расчётная');

  const newRow = page.locator('#product-import-body tr').nth(1);
  await newRow.locator('[data-import-field="price_primary"]').fill('100');
  await expect(preview.locator('[data-import-count="new"]')).toHaveText('1');
  await expect(preview.locator('[data-import-count="error"]')).toHaveText('0');
  await expect(newRow.locator('.catalog-import-calculated')).toHaveText('150 расчётная');
  await expect(page.locator('#product-import-apply')).toBeEnabled();

  await page.locator('#product-import-apply').click();
  await expect(page.locator('.system-toast').filter({ hasText: 'Импорт применён' })).toBeVisible();
  await expect(preview).toBeHidden();

  const productsResponse = await page.request.get('/api/catalog/products');
  expect(productsResponse.status()).toBe(200);
  const products = await productsResponse.json();
  const updated = products.find((item) => item.id === product.id);
  const created = products.find((item) => item.name === newName);
  expect(updated?.name).toBe(updatedName);
  expect(updated?.price_primary).toBe('250');
  expect(updated?.price_secondary).toBe('375');
  expect(created?.price_primary).toBe('100');
  expect(created?.price_secondary).toBe('150');

  await page.request.delete(`/api/catalog/products/${product.id}`);
  if (created) await page.request.delete(`/api/catalog/products/${created.id}`);
});

test('Russian Excel Windows-1251 CSV is decoded before header validation', async ({ page }) => {
  await login(page);
  await page.goto('/catalog.html');
  await waitForRouteReady(page);
  const suffix = String(Date.now()).slice(-6);
  const name = `Тест ${suffix}`;
  const csv = `Название;Цена 1 л;Активна\r\n${name};123;да\r\n`;

  await page.locator('#product-import-file').setInputFiles({
    name: 'excel-cp1251.csv',
    mimeType: 'text/csv',
    buffer: encodeWindows1251(csv)
  });

  const preview = page.locator('#product-import-preview');
  await expect(preview).toBeVisible();
  await expect(preview.locator('[data-import-count="new"]')).toHaveText('1');
  await expect(preview.locator('[data-import-count="error"]')).toHaveText('0');
  await expect(page.locator('#product-import-body [data-import-field="name"]')).toHaveValue(name);
  await expect(page.locator('.system-toast').filter({ hasText: '��������' })).toHaveCount(0);

  await page.locator('#product-import-cancel').click();
});
