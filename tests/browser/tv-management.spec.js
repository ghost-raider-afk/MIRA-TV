import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name: /войти/i }).click()
  ]);
}

test('TV network keeps cards concise and manages monitor metadata in one dialog', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await login(page);

  const stamp = Date.now();
  let locationId = null;
  let screenId = null;

  try {
    const locationResponse = await page.request.post('/api/locations', {
      data: { name: `Management ${stamp}`, address: 'TV management CI', active: true }
    });
    expect(locationResponse.status()).toBe(201);
    const location = await locationResponse.json();
    locationId = location.id;

    const screenResponse = await page.request.post(`/api/locations/${location.id}/screens`, { data: {} });
    expect(screenResponse.status()).toBe(201);
    const screen = await screenResponse.json();
    screenId = screen.id;
    const tvName = `TV ${screen.location_number || screen.id}`;

    await page.goto('/screens');
    await expect(page.locator('.main-content')).toHaveAttribute('data-route-state', 'ready');
    const unit = page.locator(`[data-tv-unit][data-screen-id="${screen.id}"]`);
    await expect(unit).toBeVisible();
    await expect(unit.locator('[data-tv-meta] .screen-tv-meta-row')).toHaveCount(3);
    await expect(unit.locator('[data-tv-meta]')).toContainText('Статус');
    await expect(unit.locator('[data-tv-meta]')).toContainText('Контент');
    await expect(unit.locator('[data-tv-meta]')).not.toContainText('IP-адрес');
    await expect(unit.locator('[data-tv-meta]')).not.toContainText('Производитель');

    await unit.getByRole('button', { name: `Управление ${tvName}` }).click();
    const dialog = page.locator('.screen-tv-management-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-tv-management-location]')).toHaveText(location.name);
    await expect(dialog.locator('[data-tv-management-device]')).toContainText('IP-адрес');
    await expect(dialog.locator('[data-tv-management-device]')).toContainText('Производитель');

    const nextName = `Экран ${stamp}`;
    await dialog.locator('[data-tv-management-name]').fill(nextName);
    await dialog.locator('[data-tv-management-content-status]').selectOption('ready');
    await dialog.locator('[data-tv-management-save]').click();
    await expect(dialog).not.toBeVisible();
    await expect(unit.locator('[data-tv-meta]')).toContainText('Готово');

    const savedResponse = await page.request.get(`/api/screens/${screen.id}`);
    expect(savedResponse.ok()).toBeTruthy();
    const saved = await savedResponse.json();
    expect(saved.name).toBe(nextName);
    expect(saved.status).toBe('ready');

    await page.goto(`/screen-editor?id=${screen.id}`);
    await expect(page).toHaveURL(new RegExp(`/screens\\?manage=${screen.id}$`));
    await expect(page.locator('.screen-tv-management-dialog')).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const box = await page.locator('.screen-tv-management-dialog').boundingBox();
    expect(box?.width).toBeLessThanOrEqual(382);
    expect(box?.height).toBeLessThanOrEqual(836);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  } finally {
    if (screenId) await page.request.delete(`/api/screens/${screenId}`).catch(() => undefined);
    if (locationId) await page.request.delete(`/api/locations/${locationId}`).catch(() => undefined);
  }
});
