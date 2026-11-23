import { test, expect } from '@playwright/test';

const adminPassword = process.env.E2E_ADMIN_PASSWORD || '';
test.skip(!adminPassword, 'E2E_ADMIN_PASSWORD is required for lifecycle integration tests');

async function adminLogin(page) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(adminPassword);
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name: /войти/i }).click()
  ]);
}

function productData(name, price = '210') {
  return {
    name, producer: 'Тестовый производитель', address: 'Тестовый адрес',
    characteristics: 'Тестовая продукция', strength: '0%',
    price_primary: price, alcoholic: false, beverage_color: 'none',
    filtration: 'none', active: true
  };
}

test('product detail exposes persisted field history, usage, archive and recoverable deletion', async ({ page }) => {
  await adminLogin(page);
  const name = `Lifecycle Test ${Date.now()}`;
  const created = await page.request.post('/api/catalog/products', { data: productData(name) });
  expect(created.status()).toBe(201);
  const product = await created.json();
  const updated = await page.request.put(`/api/catalog/products/${product.id}`, { data: productData(name, '240') });
  expect(updated.ok()).toBeTruthy();

  const historyResponse = await page.request.get(`/api/catalog/products/${product.id}/history`);
  expect(historyResponse.ok()).toBeTruthy();
  const history = await historyResponse.json();
  expect(history.items.some((item) => item.action === 'created' && item.actor_username === 'admin')).toBe(true);
  expect(history.items.some((item) => item.action === 'updated'
    && item.changes.price_primary.before === '210'
    && item.changes.price_primary.after === '240')).toBe(true);

  await page.goto('/catalog');
  await page.locator('#product-filter').fill(name);
  const row = page.locator('.catalog-product-row').filter({ hasText: name });
  await expect(row).toHaveCount(1);
  await row.click();
  const dialog = page.locator('#product-detail-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#product-detail-title')).toHaveText(name);
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    const bounds = await dialog.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(-1);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
  }
  await dialog.getByRole('tab', { name: 'История' }).click();
  await expect(dialog.locator('.catalog-history-event')).toHaveCount(2);
  await expect(dialog).toContainText('210 → 240');
  await dialog.getByRole('tab', { name: 'Где используется' }).click();
  await expect(dialog).toContainText('Товар сейчас не используется');

  await dialog.locator('#product-detail-archive').click();
  await expect(dialog.locator('#product-detail-subtitle')).toContainText('В архиве');
  await dialog.locator('#product-detail-archive').click();
  await expect(dialog.locator('#product-detail-subtitle')).toContainText('Активен');

  page.once('dialog', (confirmation) => confirmation.accept());
  await dialog.locator('#product-detail-delete').click();
  await expect(dialog).not.toBeVisible();
  const hidden = await page.request.get('/api/catalog/products');
  expect((await hidden.json()).some((item) => item.id === product.id)).toBe(false);

  await page.goto('/trash');
  const recycle = page.locator('[data-trash-products] .record-row').filter({ hasText: name });
  await expect(recycle).toBeVisible();
  await recycle.getByRole('button', { name: 'Восстановить' }).click();
  await expect(recycle).toHaveCount(0);
  const restored = await page.request.get('/api/catalog/products');
  expect((await restored.json()).some((item) => item.id === product.id)).toBe(true);
  const restoredHistory = await page.request.get(`/api/catalog/products/${product.id}/history`);
  const actions = (await restoredHistory.json()).items.map((item) => item.action);
  expect(actions).toEqual(expect.arrayContaining(['created', 'updated', 'archived', 'unarchived', 'deleted', 'restored']));
});

test('recycled location and TV restore the same scene draft, without a new monitor identity', async ({ page }) => {
  await adminLogin(page);
  const name = `Recovery Test ${Date.now()}`;
  const locationResponse = await page.request.post('/api/locations', {
    data: { name, address: 'Тестовая точка', active: true }
  });
  expect(locationResponse.status()).toBe(201);
  const location = await locationResponse.json();
  const screenResponse = await page.request.post(`/api/locations/${location.id}/screens`, { data: {} });
  expect(screenResponse.status()).toBe(201);
  const screen = await screenResponse.json();
  const originalDraftResponse = await page.request.get(`/api/screens/${screen.id}/editor`);
  expect(originalDraftResponse.ok()).toBeTruthy();
  const originalDraft = (await originalDraftResponse.json()).draft;

  expect((await page.request.delete(`/api/locations/${location.id}`)).status()).toBe(204);
  expect((await page.request.get(`/api/screens/${screen.id}`)).status()).toBe(404);
  const trashed = await page.request.get('/api/trash');
  expect((await trashed.json()).some((item) => item.type === 'location' && item.id === location.id)).toBe(true);

  const locationRestored = await page.request.post(`/api/trash/location/${location.id}/restore`, { data: {} });
  expect(locationRestored.ok()).toBeTruthy();
  const recovered = await page.request.get(`/api/screens/${screen.id}/editor`);
  expect(recovered.ok()).toBeTruthy();
  expect((await recovered.json()).draft).toEqual(originalDraft);

  expect((await page.request.delete(`/api/screens/${screen.id}`)).status()).toBe(204);
  expect((await page.request.get(`/api/screens/${screen.id}`)).status()).toBe(404);
  const screenRestored = await page.request.post(`/api/trash/screen/${screen.id}/restore`, { data: {} });
  expect(screenRestored.ok()).toBeTruthy();
  const finalDraft = await page.request.get(`/api/screens/${screen.id}/editor`);
  expect(finalDraft.ok()).toBeTruthy();
  expect((await finalDraft.json()).draft).toEqual(originalDraft);
});
