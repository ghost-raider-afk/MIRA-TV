import { test, expect } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';

async function login(page) {
  await page.goto('/signin.html');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || '');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name: /войти/i }).click()
  ]);
}

test('admin apply reaches screen_animation_settings, live Player delta and open Player DOM', async ({ browser }) => {
  const adminContext = await browser.newContext({ baseURL });
  const tvContext = await browser.newContext({ baseURL, viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
  const adminPage = await adminContext.newPage();
  const tvPage = await tvContext.newPage();
  let locationId = null;
  let screenId = null;

  await tvPage.addInitScript(() => {
    window.__miraRealtimeConnected = false;
    window.addEventListener('mira:player-realtime-connected', () => {
      window.__miraRealtimeConnected = true;
    });
  });

  try {
    await login(adminPage);

    const stamp = Date.now();
    const locationResponse = await adminPage.request.post('/api/locations', {
      data: { name: `Player E2E ${stamp}`, address: '', active: true }
    });
    expect(locationResponse.ok()).toBeTruthy();
    const location = await locationResponse.json();
    locationId = location.id;

    const screenResponse = await adminPage.request.post(`/api/locations/${locationId}/screens`, { data: {} });
    expect(screenResponse.ok()).toBeTruthy();
    const screen = await screenResponse.json();
    screenId = screen.id;

    const activationResponse = await tvPage.request.post('/api/device/activations', {
      data: { device_key: `mira-e2e-player-${stamp}` }
    });
    expect(activationResponse.ok()).toBeTruthy();
    const activation = await activationResponse.json();

    const authorizeResponse = await adminPage.request.post('/api/device-admin/authorize', {
      data: { activation_id: activation.activation_id, screen_id: screenId }
    });
    expect(authorizeResponse.ok()).toBeTruthy();

    const pollResponse = await tvPage.request.get(`/api/device/activations/${activation.activation_id}/status`, {
      headers: { 'x-device-activation-secret': activation.poll_secret }
    });
    expect(pollResponse.ok()).toBeTruthy();
    expect((await pollResponse.json()).status).toBe('authorized');

    await tvPage.goto('/player');
    await expect(tvPage.locator('[data-tv-player]')).toBeVisible({ timeout: 5000 });
    await expect(tvPage.locator('[data-player-menu-layer] svg.menu-table-svg')).toHaveCount(1);
    await expect.poll(
      () => tvPage.evaluate(() => window.__miraRealtimeConnected === true),
      { timeout: 5000 }
    ).toBe(true);

    const brandText = `LIVE-E2E-${stamp}`;
    await expect(tvPage.locator('[data-brand-layer] .scene-brand-title').filter({ hasText: brandText })).toHaveCount(0);

    await adminPage.goto(`/playlist?screen=${screenId}`);
    await expect(adminPage.locator('#animation-target-list input[value="' + screenId + '"]')).toBeChecked();
    await adminPage.locator('#animation-object-settings-select').selectOption('brand');

    const brandObject = adminPage.locator('[data-animation-object="brand"]');
    await expect(brandObject).toBeVisible();
    const visibleToggle = brandObject.locator('[data-animation-object-toggle="visible"]');
    if (!(await visibleToggle.isChecked())) await visibleToggle.check();
    await expect(adminPage.locator('#animation-brand-enabled')).toBeChecked();
    await adminPage.locator('#animation-brand-text').fill(brandText);

    const deltaPromise = tvPage.waitForResponse(async (response) => {
      if (!response.url().endsWith('/api/device/player-delta') || response.request().method() !== 'POST') return false;
      try {
        const body = await response.json();
        return body?.changed?.brand?.text === brandText;
      } catch {
        return false;
      }
    }, { timeout: 10000 });

    const applyRequestPromise = adminPage.waitForRequest(
      (request) => request.method() === 'PUT' && request.url().endsWith('/api/settings/animation/apply')
    );

    await adminPage.locator('#animation-apply-screens').click();

    const applyRequest = await applyRequestPromise;
    expect(applyRequest.postDataJSON().screen_ids).toEqual([screenId]);
    await expect(adminPage.locator('#animation-message')).toContainText('Применено на ТВ: 1');

    const storedResponse = await adminPage.request.get(`/api/settings/animation/screens/${screenId}`);
    expect(storedResponse.ok()).toBeTruthy();
    const stored = await storedResponse.json();
    expect(stored.enabled).toBe(true);
    expect(stored.profile.menu_visible).toBe(true);
    expect(stored.profile.item_effect).not.toBe('none');
    expect(stored.brand.enabled).toBe(true);
    expect(stored.brand.text).toBe(brandText);

    const deltaResponse = await deltaPromise;
    const delta = await deltaResponse.json();
    expect(delta.changed.brand.enabled).toBe(true);
    expect(delta.changed.brand.text).toBe(brandText);

    await expect(tvPage.locator('[data-player-menu-layer]')).toHaveAttribute('data-render-mode', 'flat-motion', { timeout: 5000 });
    const playerBrand = tvPage.locator('[data-brand-layer] .scene-brand-title');
    await expect(playerBrand).toHaveAttribute('aria-label', brandText, { timeout: 5000 });
    await expect(playerBrand).toBeVisible();
  } finally {
    if (screenId) {
      await adminPage.request.delete(`/api/device-admin/bindings/${screenId}`).catch(() => undefined);
    }
    if (locationId) {
      await adminPage.request.delete(`/api/locations/${locationId}`).catch(() => undefined);
    }
    await tvContext.close();
    await adminContext.close();
  }
});
