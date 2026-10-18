import { test, expect } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';

async function adminLogin(page) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name:/войти/i }).click()
  ]);
}

test('admin unbind removes TV-only caches, LKG and identity without affecting the server menu', async ({ browser }) => {
  const adminContext = await browser.newContext({ baseURL });
  const tvContext = await browser.newContext({ baseURL, serviceWorkers:'allow' });
  const admin = await adminContext.newPage();
  const tv = await tvContext.newPage();
  let locationId = null;
  let screenId = null;
  try {
    await adminLogin(admin);
    const stamp = Date.now();
    const locationResponse = await admin.request.post('/api/locations', {
      data:{ name:`Unbind E2E ${stamp}`, address:'', active:true }
    });
    expect(locationResponse.status()).toBe(201);
    locationId = (await locationResponse.json()).id;
    const screenResponse = await admin.request.post(`/api/locations/${locationId}/screens`, { data:{} });
    expect(screenResponse.status()).toBe(201);
    screenId = (await screenResponse.json()).id;

    const activationResponse = await tv.request.post('/api/device/activations', {
      data:{ device_key:`mira-unbind-${stamp}` }
    });
    expect(activationResponse.ok()).toBeTruthy();
    const activation = await activationResponse.json();
    const authorized = await admin.request.post('/api/device-admin/authorize', {
      data:{ activation_id:activation.activation_id, screen_id:screenId }
    });
    expect(authorized.ok()).toBeTruthy();
    const poll = await tv.request.get(`/api/device/activations/${activation.activation_id}/status`, {
      headers:{ 'x-device-activation-secret':activation.poll_secret }
    });
    expect((await poll.json()).status).toBe('authorized');
    await tv.goto('/player');
    await expect(tv.locator('[data-tv-player]')).toBeVisible({ timeout:10000 });
    await expect.poll(() => tv.evaluate(async () =>
      Boolean(await (await import('/js/player/player-store.js')).loadLastKnownGood())
    ), { timeout:10000 }).toBe(true);
    await expect.poll(() => tv.evaluate(async () =>
      (await caches.keys()).some((name) => name.startsWith('mira-tv-player-shell-'))
    ), { timeout:10000 }).toBe(true);

    await tv.evaluate(() => localStorage.setItem('mira-tv.weather.last.v2.unbind-test', 'cached-weather'));
    const revoked = await admin.request.delete(`/api/device-admin/bindings/${screenId}`);
    expect(revoked.status()).toBe(204);

    await expect(tv.locator('[data-activation-view]')).toBeVisible({ timeout:15000 });
    await expect.poll(() => tv.evaluate(async () => {
      const store = await import('/js/player/player-store.js');
      const [state, cachesList] = await Promise.all([store.loadLastKnownGood(), caches.keys()]);
      return {
        state:state === null,
        playerCaches:cachesList.filter((name) => name.startsWith('mira-tv-player-')).length,
        deviceKey:localStorage.getItem('mira-tv.device-key.v1'),
        weather:localStorage.getItem('mira-tv.weather.last.v2.unbind-test')
      };
    }), { timeout:15000 }).toEqual({ state:true, playerCaches:0, deviceKey:null, weather:null });
  } finally {
    if (screenId) await admin.request.delete(`/api/device-admin/bindings/${screenId}`).catch(() => undefined);
    if (locationId) await admin.request.delete(`/api/locations/${locationId}`).catch(() => undefined);
    await tvContext.close();
    await adminContext.close();
  }
});
