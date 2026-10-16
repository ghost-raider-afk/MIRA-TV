import { test, expect } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';

async function login(page) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name:/войти/i }).click()
  ]);
}

test('Apply on TV reprovisions Player without losing the existing binding', async ({ browser }) => {
  const adminContext = await browser.newContext({ baseURL });
  const tvContext = await browser.newContext({ baseURL, viewport:{ width:1920, height:1080 }, serviceWorkers:'block' });
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

    const activationResponse = await tvPage.request.post('/api/device/activations', {
      data:{ device_key:`mira-reprovision-${stamp}` }
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
    await expect(tvPage.locator('[data-tv-player]')).toBeVisible({ timeout:5000 });

    const beforeBindings = await (await adminPage.request.get('/api/device-admin/bindings')).json();
    const beforeBinding = beforeBindings.find((entry) => Number(entry.screen_id) === Number(screenId));
    expect(beforeBinding?.device_id).toBeTruthy();

    const applyResponse = await adminPage.request.post(`/api/device-admin/bindings/${screenId}/apply`, { data:{} });
    expect(applyResponse.status()).toBe(202);
    const apply = await applyResponse.json();
    expect(apply.command_id).toMatch(/^[0-9a-f-]{36}$/i);

    await expect.poll(async () => {
      const response = await adminPage.request.get(`/api/device-admin/bindings/${screenId}/apply/${apply.command_id}`);
      if (!response.ok()) return 'missing';
      return (await response.json()).status;
    }, { timeout:15000 }).toBe('completed');

    await expect.poll(() => navigations.some((value) => new URL(value).pathname === '/tv-recovery'), { timeout:5000 }).toBe(true);
    await expect.poll(() => {
      try {
        const url = new URL(tvPage.url());
        return url.pathname === '/player' && url.searchParams.get('reprovision') === apply.command_id;
      } catch { return false; }
    }, { timeout:5000 }).toBe(true);

    const afterBindings = await (await adminPage.request.get('/api/device-admin/bindings')).json();
    const afterBinding = afterBindings.find((entry) => Number(entry.screen_id) === Number(screenId));
    expect(afterBinding?.device_id).toBe(beforeBinding.device_id);
    expect(afterBinding?.online).toBe(true);
  } finally {
    if (screenId) await adminPage.request.delete(`/api/device-admin/bindings/${screenId}`).catch(() => undefined);
    if (locationId) await adminPage.request.delete(`/api/locations/${locationId}`).catch(() => undefined);
    await tvContext.close();
    await adminContext.close();
  }
});
