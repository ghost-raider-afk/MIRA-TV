import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name: /войти/i }).click()
  ]);
  await expect(page.locator('.main-content')).toHaveAttribute('data-route-state', 'ready');
}

test('mobile TV pairing is styled after SPA navigation and keeps one active step', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  await page.locator('.ui-rail-button[aria-label="TV-сеть"]').click();
  await expect(page.locator('.ui-context')).toHaveClass(/is-collapsed/);
  const sectionTrigger = page.locator('[data-mobile-context-trigger]');
  await expect(sectionTrigger).toBeVisible();
  await sectionTrigger.click();
  await expect(sectionTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.ui-context')).not.toHaveClass(/is-collapsed/);
  await page.locator('.ui-context-body .app-route-link', { hasText: 'Подключить ТВ' }).click();
  await expect(page).toHaveURL(/\/connect-tv$/);
  await expect(page.locator('.main-content')).toHaveAttribute('data-route-state', 'ready');
  await expect(page.locator('.ui-context')).toHaveClass(/is-collapsed/);
  await expect.poll(() => page.evaluate(() => typeof window.jsQR)).toBe('function');
  await expect(page.locator('script[data-mira-jsqr="1"]')).toHaveCount(1);

  const scanStep = page.locator('[data-connect-step="scan"]');
  const locationStep = page.locator('[data-connect-step="location"]');
  const screenStep = page.locator('[data-connect-step="screen"]');
  await expect(scanStep).toBeVisible();
  await expect(locationStep).toBeHidden();
  await expect(screenStep).toBeHidden();
  await expect(page.getByRole('button', { name: 'Сканировать QR-код' })).toBeVisible();
  await expect(scanStep).toHaveCSS('background-color', /rgb\(/);
  expect(await scanStep.evaluate((node) => getComputedStyle(node).borderRadius)).not.toBe('0px');
  expect(await page.locator('.connect-tv-progress').evaluate((node) => getComputedStyle(node).display)).toBe('grid');

  await page.getByRole('button', { name: /ввести код/i }).first().click();
  await expect(page.getByLabel('6-значный резервный код')).toBeVisible();

  const decoder = await page.request.get('/vendor/jsQR.js');
  expect(decoder.ok()).toBeTruthy();

  await sectionTrigger.click();
  await expect(sectionTrigger).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.ui-context-body .app-route-link[href="/screens"]').click();
  await expect(page).toHaveURL(/\/screens$/);
  const returnTrigger = page.locator('[data-mobile-context-trigger]');
  await returnTrigger.click();
  await expect(returnTrigger).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.ui-context-body .app-route-link[href="/connect-tv"]').click();
  await expect(page).toHaveURL(/\/connect-tv$/);
  await expect(page.locator('.main-content')).toHaveAttribute('data-route-state', 'ready');
  await page.getByRole('button', { name: /ввести код/i }).first().click();
  await expect(page.getByLabel('6-значный резервный код')).toBeVisible();

  const scanner = page.locator('[data-scanner]');
  await scanner.evaluate((element) => element.classList.remove('is-hidden'));
  await expect(scanner).toBeVisible();
  const box = await scanner.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(385);
  expect(box?.height).toBeGreaterThanOrEqual(835);
  await expect(page.getByRole('button', { name: 'Закрыть сканер' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ввести 6-значный код' })).toBeVisible();
});


test('TV network connect action keeps pairing locked to the selected TV screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page);

  const stamp = Date.now();
  let locationId = null;
  let screenId = null;

  try {
    const locationResponse = await page.request.post('/api/locations', {
      data: { name: `Targeted TV ${stamp}`, address: 'Тестовая точка подключения', active: true }
    });
    expect(locationResponse.ok()).toBeTruthy();
    const location = await locationResponse.json();
    locationId = location.id;

    const screenResponse = await page.request.post(`/api/locations/${location.id}/screens`, { data: {} });
    expect(screenResponse.ok()).toBeTruthy();
    const screen = await screenResponse.json();
    screenId = screen.id;
    const tvName = `TV ${screen.location_number || screen.id}`;

    await page.goto('/screens');
    const unit = page.locator(`[data-tv-unit][data-screen-id="${screen.id}"]`);
    await expect(unit).toBeVisible();
    const connect = unit.locator('[data-tv-bind-action]');
    await expect(connect).toHaveAttribute('href', `/connect-tv?screen=${screen.id}`);
    await expect(connect).toHaveAttribute('aria-label', `Подключить ${tvName}`);

    await connect.click();
    await expect(page).toHaveURL(new RegExp(`/connect-tv\\?screen=${screen.id}$`));
    await expect(page.locator('.connect-tv-flow')).toHaveClass(/is-targeted/);
    await expect(page.locator('.connect-tv-heading h1')).toHaveText(`Подключить ${tvName}`);
    await expect(page.locator('.connect-tv-heading-copy')).toContainText(location.name);
    await expect(page.locator('[data-connect-step="location"]')).toBeHidden();
    await expect(page.locator('[data-progress-step="location"]')).toBeHidden();
    await expect(page.locator('[data-progress-step="screen"] b')).toHaveText('2');

    await page.route('**/api/device-admin/resolve', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ activation_id: `targeted-${stamp}` })
      });
    });

    await page.getByRole('button', { name: /ввести код/i }).first().click();
    await page.getByLabel('6-значный резервный код').fill('123456');
    await page.getByRole('button', { name: 'Продолжить' }).click();

    const screenStep = page.locator('[data-connect-step="screen"]');
    await expect(screenStep).not.toHaveClass(/is-disabled/);
    const options = screenStep.locator('.connect-tv-option');
    await expect(options).toHaveCount(1);
    await expect(options.first()).toHaveClass(/is-selected/);
    await expect(options.first()).toContainText(screen.name);
    const authorize = page.locator('[data-authorize]');
    await expect(authorize).toBeEnabled();
    await expect(authorize).toHaveText(`Подключить к ${tvName}`);
  } finally {
    if (screenId) await page.request.delete(`/api/screens/${screenId}`).catch(() => undefined);
    if (locationId) await page.request.delete(`/api/locations/${locationId}`).catch(() => undefined);
  }
});


test('TV network shows Local-first cache status and runs safe cache commands on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  const stamp = Date.now();
  let locationId = null;
  let screenId = null;
  let commandId = '';
  const cacheStatus = () => ({
    device_id:901,
    screen_id:Number(screenId),
    reported_at:new Date().toISOString(),
    server_received_at:new Date().toISOString(),
    local_first:true,
    service_worker_active:true,
    active_revision:'5:41',
    previous_revision:'5:40',
    staging_revision:'',
    active_assets:3,
    cached_assets:3,
    missing_assets:0,
    retained_assets:4,
    unused_assets:1,
    active_bytes:25 * 1024 * 1024,
    retained_bytes:31 * 1024 * 1024,
    storage_usage_bytes:45 * 1024 * 1024,
    storage_quota_bytes:512 * 1024 * 1024,
    storage_persisted:true,
    last_command_id:commandId,
    last_command_action:commandId ? 'check' : '',
    last_command_ok:commandId ? true : null,
    last_command_message:commandId ? 'Кэш проверен.' : '',
    last_command_completed_at:commandId ? new Date().toISOString() : null
  });

  try {
    const locationResponse = await page.request.post('/api/locations', {
      data:{ name:`Cache TV ${stamp}`, address:'Cache CI', active:true }
    });
    expect(locationResponse.ok()).toBeTruthy();
    const location = await locationResponse.json();
    locationId = location.id;

    const screenResponse = await page.request.post(`/api/locations/${location.id}/screens`, { data:{} });
    expect(screenResponse.ok()).toBeTruthy();
    const screen = await screenResponse.json();
    screenId = screen.id;

    await page.route(/\/api\/device-admin\/bindings(?:\?[^/]*)?$/, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({
        status:200,
        contentType:'application/json',
        body:JSON.stringify([{
          binding_id:801,
          device_id:901,
          screen_id:Number(screenId),
          manufacturer:'Test',
          model:'TV',
          remote_address:'127.0.0.1',
          online:true,
          realtime_connections:1,
          realtime_connected_at:new Date().toISOString(),
          realtime_last_seen_at:new Date().toISOString(),
          session_last_seen_at:new Date().toISOString(),
          preview_available:false,
          preview_updated_at:null,
          cache_status:cacheStatus(),
          player_diagnostic:null
        }])
      });
    });

    await page.route(`**/api/device-admin/bindings/${screen.id}/cache-command`, async (route) => {
      expect(route.request().method()).toBe('POST');
      expect(route.request().postDataJSON()).toEqual({ action:'check' });
      commandId = 'cache-command-test-0001';
      await route.fulfill({
        status:202,
        contentType:'application/json',
        body:JSON.stringify({ accepted:true, request_id:commandId, action:'check' })
      });
    });

    await page.goto('/screens');
    await expect(page.locator('.main-content')).toHaveAttribute('data-route-state', 'ready');
    const unit = page.locator(`[data-tv-unit][data-screen-id="${screen.id}"]`);
    await expect(unit).toContainText('Кэш');
    await expect(unit).toContainText('готово · 3/3');

    await unit.getByRole('button', { name:/Управление кэшем/ }).click();
    const dialog = page.locator('.screen-tv-cache-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Активная ревизия');
    await expect(dialog).toContainText('5:41');
    await expect(dialog).toContainText('Резервная ревизия');
    await expect(dialog).toContainText('25 МБ');
    await expect(dialog).toContainText('45 МБ / 512 МБ');

    const box = await dialog.boundingBox();
    expect(box.width).toBeLessThanOrEqual(390);
    await expect(dialog.getByRole('button', { name:'Проверить' })).toBeVisible();
    await expect(dialog.getByRole('button', { name:'Очистить лишнее' })).toBeVisible();
    await expect(dialog.getByRole('button', { name:'Перескачать активное' })).toBeVisible();

    await dialog.getByRole('button', { name:'Проверить' }).click();
    await expect(dialog.locator('[data-tv-cache-message]')).toContainText('Кэш проверен.', { timeout:5000 });
  } finally {
    await page.unrouteAll({ behavior:'ignoreErrors' }).catch(() => undefined);
    if (screenId) await page.request.delete(`/api/screens/${screenId}`).catch(() => undefined);
    if (locationId) await page.request.delete(`/api/locations/${locationId}`).catch(() => undefined);
  }
});
