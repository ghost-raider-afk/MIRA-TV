import { test, expect } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';
const staleShellCache = 'mira-tv-player-shell-v-stale-e2e';
const activeShellCache = 'mira-tv-player-shell-v75';

async function login(page) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name:/войти/i }).click()
  ]);
}

test('Apply on TV clears stale Player shell and keeps the existing binding', async ({ browser }) => {
  const adminContext = await browser.newContext({ baseURL });
  const tvContext = await browser.newContext({ baseURL, viewport:{ width:1920, height:1080 } });
  const adminPage = await adminContext.newPage();
  const tvPage = await tvContext.newPage();
  const navigations = [];
  tvPage.on('framenavigated', (frame) => {
    if (frame === tvPage.mainFrame()) navigations.push(frame.url());
  });

  let locationId = null;
  let screenId = null;
  try {
    await login(adminPage);
    const stamp = Date.now();
    const locationResponse = await adminPage.request.post('/api/locations', {
      data:{ name:`Reprovision E2E ${stamp}`, address:'', active:true }
    });
    expect(locationResponse.status()).toBe(201);
    locationId = (await locationResponse.json()).id;

    const screenResponse = await adminPage.request.post(`/api/locations/${locationId}/screens`, { data:{} });
    expect(screenResponse.status()).toBe(201);
    screenId = (await screenResponse.json()).id;

    const deviceKey = `mira-reprovision-${stamp}`;
    const activationResponse = await tvPage.request.post('/api/device/activations', {
      data:{ device_key:deviceKey }
    });
    expect(activationResponse.ok()).toBeTruthy();
    const activation = await activationResponse.json();

    const authorizeResponse = await adminPage.request.post('/api/device-admin/authorize', {
      data:{ activation_id:activation.activation_id, screen_id:screenId }
    });
    expect(authorizeResponse.ok()).toBeTruthy();

    const pollResponse = await tvPage.request.get(`/api/device/activations/${activation.activation_id}/status`, {
      headers:{ 'x-device-activation-secret':activation.poll_secret }
    });
    expect(pollResponse.ok()).toBeTruthy();
    expect((await pollResponse.json()).status).toBe('authorized');

    await tvPage.goto('/player');
    await expect(tvPage.locator('[data-tv-player]')).toBeVisible({ timeout:10000 });
    await expect.poll(() => tvPage.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return '';
      const registration = await navigator.serviceWorker.ready;
      return registration.active?.scriptURL || '';
    }), { timeout:10000 }).toContain('/player-sw.js');

    await tvPage.evaluate(async (name) => {
      await caches.open(name);
    }, staleShellCache);
    expect(await tvPage.evaluate((name) => caches.keys().then((names) => names.includes(name)), staleShellCache)).toBe(true);
    const storedDeviceKey = await tvPage.evaluate(() => localStorage.getItem('mira-tv.device-key.v1'));
    expect(storedDeviceKey).toBe(deviceKey);

    const beforeBindings = await (await adminPage.request.get('/api/device-admin/bindings')).json();
    const beforeBinding = beforeBindings.find((entry) => Number(entry.screen_id) === Number(screenId));
    expect(beforeBinding?.device_id).toBeTruthy();
    const previewBefore = String(beforeBinding?.preview_updated_at || '');

    const applyResponse = await adminPage.request.post(`/api/device-admin/bindings/${screenId}/apply`, { data:{} });
    expect(applyResponse.status()).toBe(202);
    const apply = await applyResponse.json();
    expect(apply.command_id).toMatch(/^[0-9a-f-]{36}$/i);

    await expect.poll(async () => {
      const response = await adminPage.request.get(`/api/device-admin/bindings/${screenId}/apply/${apply.command_id}`);
      if (!response.ok()) return 'missing';
      return (await response.json()).status;
    }, { timeout:30000 }).toBe('completed');

    await expect.poll(() => navigations.some((value) => new URL(value).pathname === '/tv-recovery'), { timeout:10000 }).toBe(true);
    await expect.poll(() => {
      try {
        const url = new URL(tvPage.url());
        return url.pathname === '/player' && url.searchParams.get('reprovision') === apply.command_id;
      } catch { return false; }
    }, { timeout:10000 }).toBe(true);

    await expect.poll(() => tvPage.evaluate((name) => caches.keys().then((names) => names.includes(name)), staleShellCache), { timeout:10000 }).toBe(false);
    await expect.poll(() => tvPage.evaluate(() => caches.keys()), { timeout:10000 }).toContain(activeShellCache);
    expect(await tvPage.evaluate(() => localStorage.getItem('mira-tv.device-key.v1'))).toBe(deviceKey);

    const afterBindings = await (await adminPage.request.get('/api/device-admin/bindings')).json();
    const afterBinding = afterBindings.find((entry) => Number(entry.screen_id) === Number(screenId));
    expect(afterBinding?.device_id).toBe(beforeBinding.device_id);
    expect(afterBinding?.online).toBe(true);
    expect(String(afterBinding?.preview_updated_at || '')).not.toBe('');
    expect(String(afterBinding?.preview_updated_at || '')).not.toBe(previewBefore);
  } finally {
    if (screenId) await adminPage.request.delete(`/api/device-admin/bindings/${screenId}`).catch(() => undefined);
    if (locationId) await adminPage.request.delete(`/api/locations/${locationId}`).catch(() => undefined);
    await tvContext.close();
    await adminContext.close();
  }
});
