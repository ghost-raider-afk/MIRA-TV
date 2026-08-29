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

test('main menu and context submenu navigate inside one persistent document', async ({ page }) => {
  await login(page);
  await page.evaluate(() => { window.__tvMenuSpaSentinel = `sentinel-${Math.random()}`; });
  const sentinel = await page.evaluate(() => window.__tvMenuSpaSentinel);
  const documentRequests = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'document') documentRequests.push(request.url());
  });

  await page.locator('.ui-rail-button[aria-label="Мониторы"]').click();
  await expect(page).toHaveURL(/\/screens$/);
  await expect(page.locator('[data-screen-hierarchy]')).toBeVisible();
  expect(await page.evaluate(() => window.__tvMenuSpaSentinel)).toBe(sentinel);

  await page.getByRole('link', { name: /Торговые точки/ }).click();
  await expect(page).toHaveURL(/\/locations$/);
  await expect(page.locator('#location-form')).toBeVisible();
  expect(await page.evaluate(() => window.__tvMenuSpaSentinel)).toBe(sentinel);

  await page.locator('.ui-rail-button[aria-label="Каталог"]').click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.locator('#product-form')).toBeVisible();
  expect(await page.evaluate(() => window.__tvMenuSpaSentinel)).toBe(sentinel);
  await expect(page.locator('.ui-context-body .app-route-link')).toHaveCount(1);
  await expect(page.locator('.ui-context-body .app-route-link')).toHaveText(/Продукция/);
  await expect(page.locator('.ui-context')).not.toHaveClass(/is-collapsed/);

  await page.locator('.ui-context-body .app-route-link', { hasText: 'Продукция' }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.locator('.ui-context')).toHaveClass(/is-collapsed/);
  expect(await page.evaluate(() => window.__tvMenuSpaSentinel)).toBe(sentinel);

  await page.locator('.ui-rail-button[aria-label="Настройки"]').click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.locator('#site-settings-form')).toBeVisible();
  await expect(page.locator('.ui-context')).not.toHaveClass(/is-collapsed/);
  expect(await page.evaluate(() => window.__tvMenuSpaSentinel)).toBe(sentinel);

  await page.getByRole('link', { name: /^SFTP$/ }).click();
  await expect(page).toHaveURL(/\/sftp-settings$/);
  await expect(page.locator('#sftp-directory-form')).toBeVisible();
  await expect(page.locator('#sftp-file-list')).toBeAttached();
  await expect(page.locator('.ui-context')).toHaveClass(/is-collapsed/);
  expect(await page.evaluate(() => window.__tvMenuSpaSentinel)).toBe(sentinel);

  expect(documentRequests).toEqual([]);
});

test('context submenu auto-collapses consistently and responsive state is not persisted', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.evaluate(() => localStorage.removeItem('tv-menu.context-collapsed'));

  for (const label of ['Мониторы', 'Каталог', 'Настройки']) {
    await page.locator(`.ui-rail-button[aria-label="${label}"]`).click();
    const context = page.locator('.ui-context');
    await expect(context).not.toHaveClass(/is-collapsed/);
    await context.dispatchEvent('pointerleave');
    await expect(context).toHaveClass(/is-collapsed/);
  }

  await page.evaluate(() => localStorage.removeItem('tv-menu.context-collapsed'));
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.ui-context')).toHaveClass(/is-collapsed/);
  expect(await page.evaluate(() => localStorage.getItem('tv-menu.context-collapsed'))).toBeNull();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.ui-context')).not.toHaveClass(/is-collapsed/);
  expect(await page.evaluate(() => localStorage.getItem('tv-menu.context-collapsed'))).toBeNull();
});

test('saved application name immediately controls browser tab title on every route', async ({ page }) => {
  await login(page);
  await page.locator('.ui-rail-button[aria-label="Настройки"]').click();
  await expect(page).toHaveURL(/\/settings$/);
  const original = await page.evaluate(async () => (await fetch('/api/settings/site', { credentials: 'same-origin' })).json());
  const nextName = `TV MENU TITLE ${Date.now()}`;

  try {
    await page.locator('#site-app-name').fill(nextName);
    await page.locator('#site-settings-submit').click();
    await expect(page.locator('#site-settings-message')).toContainText('Настройки сайта сохранены');
    await expect(page).toHaveTitle(`${nextName} — Настройки сайта`);

    await page.locator('.ui-rail-button[aria-label="Каталог"]').click();
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
  await page.evaluate(() => { window.__tvMenuSpaHistorySentinel = `history-${Math.random()}`; });
  const sentinel = await page.evaluate(() => window.__tvMenuSpaHistorySentinel);

  await page.locator('.ui-rail-button[aria-label="Каталог"]').click();
  await expect(page).toHaveURL(/\/catalog$/);
  await page.locator('.ui-rail-button[aria-label="Настройки"]').click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.locator('#product-form')).toBeVisible();
  expect(await page.evaluate(() => window.__tvMenuSpaHistorySentinel)).toBe(sentinel);

  await page.goForward();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.locator('#site-settings-form')).toBeVisible();
  expect(await page.evaluate(() => window.__tvMenuSpaHistorySentinel)).toBe(sentinel);
});
