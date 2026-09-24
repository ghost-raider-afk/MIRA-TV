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

async function waitForRouteReady(page) {
  await expect(page.locator('.main-content')).toHaveAttribute('data-route-state', 'ready');
}

async function forceLightTheme(page) {
  if (await page.locator('html').getAttribute('data-theme') === 'light') return;
  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
}

test('site name updates the persistent application shell immediately after save', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  await waitForRouteReady(page);
  const input = page.locator('#site-app-name');
  await expect(input).not.toHaveValue('');
  const original = await input.inputValue();
  const changed = `MIRA-TV TEST ${Date.now()}`;

  await input.fill(changed);
  await page.locator('#site-settings-submit').click();
  await expect(page.locator('#site-settings-message')).toContainText('сохранены');
  await expect(page.locator('.app-header [data-app-name]')).toHaveText(changed);
  await expect(page).toHaveTitle(`${changed} — Настройки сайта`);

  const sentinel = `branding-${Math.random()}`;
  await page.evaluate((value) => { window.__brandingSentinel = value; }, sentinel);
  await page.locator('.ui-rail-button[aria-label="TV-сеть"]').click();
  await expect(page).toHaveURL(/\/screens$/);
  await waitForRouteReady(page);
  await expect(page.locator('.app-header [data-app-name]')).toHaveText(changed);
  await expect(page).toHaveTitle(`${changed} — Мониторы`);
  expect(await page.evaluate(() => window.__brandingSentinel)).toBe(sentinel);

  await page.locator('.ui-rail-button[aria-label="Настройки"]').click();
  await expect(page).toHaveURL(/\/settings$/);
  await waitForRouteReady(page);
  await expect(page.locator('#site-app-name')).toHaveValue(changed);
  await page.locator('#site-app-name').fill(original);
  await page.locator('#site-settings-submit').click();
  await expect(page.locator('#site-settings-message')).toContainText('сохранены');
  await expect(page.locator('.app-header [data-app-name]')).toHaveText(original);
  await expect(page).toHaveTitle(`${original} — Настройки сайта`);
});

test('site interface scale uses 100% as the enlarged 125% baseline and can move both directions', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  await waitForRouteReady(page);

  const input = page.locator('#site-ui-scale');
  await expect(input).toBeVisible();
  const original = Number(await input.inputValue()) || 100;

  await input.fill('80');
  await page.locator('#site-settings-submit').click();
  await expect(page.locator('#site-settings-message')).toContainText('сохранены');
  await expect(page.locator('html')).toHaveAttribute('data-ui-scale-percent', '80');
  expect(await page.locator('html').evaluate((node) => node.style.getPropertyValue('--ui-scale-factor'))).toBe('1');
  expect(await page.locator('body').evaluate((node) => getComputedStyle(node).fontSize)).toBe('13px');
  expect(Math.round((await input.boundingBox()).height)).toBe(32);
  expect(Math.round((await page.locator('#site-settings-submit').boundingBox()).height)).toBe(32);
  expect(await page.locator('html').evaluate((node) => node.style.zoom)).toBe('');

  await input.fill('100');
  await page.locator('#site-settings-submit').click();
  await expect(page.locator('#site-settings-message')).toContainText('сохранены');
  await expect(page.locator('html')).toHaveAttribute('data-ui-scale-percent', '100');
  expect(await page.locator('html').evaluate((node) => node.style.getPropertyValue('--ui-scale-factor'))).toBe('1.25');
  expect(await page.locator('body').evaluate((node) => getComputedStyle(node).fontSize)).toBe('16.25px');
  expect(Math.round((await input.boundingBox()).height)).toBe(40);
  expect(Math.round((await page.locator('#site-settings-submit').boundingBox()).height)).toBe(40);
  expect(await page.locator('html').evaluate((node) => node.style.zoom)).toBe('');
  expect(await page.evaluate(() => localStorage.getItem('mira-tv-ui-scale-percent'))).toBe('100');

  if (original !== 100) {
    await input.fill(String(original));
    await page.locator('#site-settings-submit').click();
    await expect(page.locator('#site-settings-message')).toContainText('сохранены');
  }
});

test('light theme uses light semantic chrome and editor surfaces', async ({ page }) => {
  await login(page);
  await forceLightTheme(page);

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const locationResponse = await page.request.post('/api/locations', { data: { name: `Light ${suffix}`, address: 'Theme CI' } });
  expect(locationResponse.status()).toBe(201);
  const location = await locationResponse.json();
  const screenResponse = await page.request.post(`/api/locations/${location.id}/screens`, { data: {} });
  expect(screenResponse.status()).toBe(201);
  const screen = await screenResponse.json();

  await page.goto(`/scene?screen=${screen.id}`);
  await waitForRouteReady(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.scene-editor-commandbar')).toBeVisible();
  await expect(page.locator('.scene-editor-canvas-panel')).toBeVisible();
  await expect(page.locator('.scene-editor-properties-panel')).toBeVisible();

  const colors = await page.evaluate(() => {
    const css = (selector) => getComputedStyle(document.querySelector(selector)).backgroundColor;
    return {
      rail: css('.ui-rail'),
      context: css('.ui-context'),
      commandbar: css('.scene-editor-commandbar'),
      editorSurface: css('.scene-editor-canvas-panel'),
      inspector: css('.scene-editor-properties-panel'),
      page: getComputedStyle(document.body).backgroundColor
    };
  });

  expect(colors.rail).toBe('rgb(255, 255, 255)');
  expect(colors.context).toBe('rgb(248, 249, 251)');
  expect(colors.editorSurface).not.toBe('rgb(21, 29, 41)');
  expect(colors.inspector).not.toBe('rgb(21, 29, 41)');
  expect(colors.commandbar).not.toBe('rgb(21, 29, 41)');
  expect(colors.page).not.toBe('rgb(13, 17, 24)');
});
