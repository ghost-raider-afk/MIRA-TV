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

test('main menu and integrated desktop dropdowns navigate inside one persistent document', async ({ page }) => {
  await login(page);
  await page.evaluate(() => { window.__miraTvSpaSentinel = `sentinel-${Math.random()}`; });
  const sentinel = await page.evaluate(() => window.__miraTvSpaSentinel);
  const documentRequests = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'document') documentRequests.push(request.url());
  });

  await expect(page.locator('.ui-rail-button[aria-label="Плейлист"]')).toHaveCount(0);
  const monitors = page.locator('.app-header-nav-item[data-header-nav-group="monitors"]');
  await monitors.locator('.app-header-nav-link').click();
  await expect(page).toHaveURL(/\/screens$/);
  await expect(page.locator('[data-screen-hierarchy]')).toBeVisible();
  await expect(page.locator('.ui-context')).toBeHidden();
  await expect(monitors.locator('.app-header-dropdown-link', { hasText: 'Плейлист' })).toHaveCount(0);
  await expect(monitors.locator('.app-header-dropdown-link', { hasText: 'Сцена' })).toHaveCount(0);
  await expect(page.locator('.app-header-nav-link[data-header-section="scene"]')).toBeVisible();
  expect(await page.evaluate(() => window.__miraTvSpaSentinel)).toBe(sentinel);

  await monitors.hover();
  await expect(monitors.locator('.app-header-dropdown')).toBeVisible();
  await monitors.getByRole('menuitem', { name: 'Торговые точки' }).click();
  await expect(page).toHaveURL(/\/locations$/);
  await expect(page.locator('#location-form')).toBeVisible();
  expect(await page.evaluate(() => window.__miraTvSpaSentinel)).toBe(sentinel);

  await page.locator('.app-header-nav-link[data-header-section="catalog"]').click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.locator('#product-dialog')).not.toBeVisible();
  await expect(page.locator('[data-products-list]')).toBeVisible();
  expect(await page.evaluate(() => window.__miraTvSpaSentinel)).toBe(sentinel);
  await expect(page.locator('.ui-context')).toBeHidden();

  const settings = page.locator('.app-header-nav-item[data-header-nav-group="settings"]');
  await settings.locator('.app-header-nav-link').click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.locator('#site-settings-form')).toBeVisible();
  await expect(page.locator('.ui-context')).toBeHidden();
  await settings.hover();
  await expect(settings.locator('.app-header-dropdown')).toBeVisible();
  await expect(settings.getByRole('menuitem', { name: 'Настройки сайта' })).toHaveClass(/active/);
  expect(await page.evaluate(() => window.__miraTvSpaSentinel)).toBe(sentinel);

  expect(documentRequests).toEqual([]);

  await page.goto('/playlist');
  await expect(page).toHaveURL(/\/scene$/);
  await page.goto('/animation');
  await expect(page).toHaveURL(/\/scene$/);
});

test('desktop uses one floating top bar while mobile keeps the bottom rail and collapsible section sheet', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const header = page.locator('.app-header');
  const nav = page.locator('.app-header-nav');
  const indicator = nav.locator('.app-header-nav-indicator');
  await expect(page.locator('.ui-rail')).toBeHidden();
  await expect(header).toBeVisible();
  await expect(header).toHaveCSS('border-radius', '17px');
  await expect(nav).toBeVisible();
  await expect(nav).toHaveClass(/has-indicator/);
  await expect(indicator).toBeVisible();

  const initialBox = await indicator.boundingBox();
  await page.locator('.app-header-nav-link[data-header-section="catalog"]').hover();
  await expect.poll(async () => (await indicator.boundingBox())?.x || 0).not.toBe(initialBox?.x || 0);

  const monitors = page.locator('.app-header-nav-item[data-header-nav-group="monitors"]');
  await monitors.locator('.app-header-nav-link').click();
  await expect(page.locator('.ui-context')).toBeHidden();
  await monitors.hover();
  await expect(monitors.locator('.app-header-dropdown')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.ui-rail')).toBeVisible();
  await expect(nav).toBeHidden();
  await expect(page.locator('.ui-context')).toHaveClass(/is-collapsed/);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.ui-context')).toBeHidden();
});

test('saved application name immediately controls browser tab title on every route', async ({ page }) => {
  await login(page);
  await page.locator('.app-header-nav-link[data-header-section="settings"]').click();
  await expect(page).toHaveURL(/\/settings$/);
  const original = await page.evaluate(async () => (await fetch('/api/settings/site', { credentials: 'same-origin' })).json());
  const nextName = `MIRA-TV TITLE ${Date.now()}`;

  try {
    await page.locator('#site-app-name').fill(nextName);
    await page.locator('#site-settings-submit').click();
    await expect(page.locator('#site-settings-message')).toContainText('Настройки сайта сохранены');
    await expect(page).toHaveTitle(`${nextName} — Настройки сайта`);
    await expect(page.locator('[data-header-home-name]')).toHaveText(nextName);

    await page.locator('.app-header-nav-link[data-header-section="catalog"]').click();
    await expect(page).toHaveURL(/\/catalog$/);
    await expect(page).toHaveTitle(`${nextName} — Каталог`);
  } finally {
    await page.evaluate(async (site) => {
      const response = await fetch('/api/settings/site', {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_name: site.app_name || site.application_name,
          accent_color: site.accent_color,
          signin_logo_size: site.signin_logo_size,
          timezone: site.timezone,
          date_format: site.date_format,
          dashboard_refresh_seconds: site.dashboard_refresh_seconds,
          default_screen_resolution: site.default_screen_resolution
        })
      });
      if (!response.ok) throw new Error(`site restore failed: ${response.status}`);
    }, original);
  }
});

test('browser back and forward keep the same application document', async ({ page }) => {
  await login(page);
  await page.evaluate(() => { window.__miraTvSpaHistorySentinel = `history-${Math.random()}`; });
  const sentinel = await page.evaluate(() => window.__miraTvSpaHistorySentinel);

  await page.locator('.app-header-nav-link[data-header-section="catalog"]').click();
  await expect(page).toHaveURL(/\/catalog$/);
  await page.locator('.app-header-nav-link[data-header-section="settings"]').click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.locator('#product-dialog')).not.toBeVisible();
  await expect(page.locator('[data-products-list]')).toBeVisible();
  expect(await page.evaluate(() => window.__miraTvSpaHistorySentinel)).toBe(sentinel);

  await page.goForward();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.locator('#site-settings-form')).toBeVisible();
  expect(await page.evaluate(() => window.__miraTvSpaHistorySentinel)).toBe(sentinel);
});
