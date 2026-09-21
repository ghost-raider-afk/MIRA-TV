import { test, expect } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';

async function login(page) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name: /войти/i }).click()
  ]);
}

function textScene(value) {
  return {
    version: 1,
    elements: [{
      id: 'live-e2e-text',
      type: 'text',
      enabled: true,
      x: 1280, y: 80, width: 560, height: 160,
      z_index: 10, opacity: 1, rotation_deg: 0,
      text: {
        runs: [{
          value,
          font_family: 'system-sans',
          font_size_px: 64,
          font_weight: 800,
          color: '#FFFFFF',
          text_transform: 'none'
        }],
        paragraph: { align: 'center', vertical_align: 'center', wrap: true },
        effects: { fill: { enabled: true, mode: 'solid', color: '#FFFFFF', opacity: 1 } }
      }
    }]
  };
}

test('admin scene save reaches live Player delta and updates keyed generic DOM', async ({ browser }) => {
  const adminContext = await browser.newContext({ baseURL });
  const tvContext = await browser.newContext({ baseURL, viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
  const adminPage = await adminContext.newPage();
  const tvPage = await tvContext.newPage();
  let locationId = null;
  let screenId = null;

  await tvPage.addInitScript(() => {
    window.__miraRealtimeConnected = false;
    window.addEventListener('mira:player-realtime-connected', () => { window.__miraRealtimeConnected = true; });
  });

  try {
    await login(adminPage);
    const stamp = Date.now();

    const locationResponse = await adminPage.request.post('/api/locations', {
      data: { name: `Player E2E ${stamp}`, address: '', active: true }
    });
    expect(locationResponse.status()).toBe(201);
    const location = await locationResponse.json();
    locationId = location.id;

    const screenResponse = await adminPage.request.post(`/api/locations/${locationId}/screens`, { data: {} });
    expect(screenResponse.status()).toBe(201);
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
    const menu = tvPage.locator('[data-player-menu-layer] svg.menu-table-svg');
    await expect(menu).toHaveCount(1);
    await menu.evaluate((node) => { node.dataset.identityProbe = 'stable-menu'; });
    await expect.poll(() => tvPage.evaluate(() => window.__miraRealtimeConnected === true), { timeout: 5000 }).toBe(true);

    const tvNetworkState = async () => {
      const response = await adminPage.request.get('/api/device-admin/bindings?measure_ping=1');
      const binding = (await response.json()).find((item) => Number(item.screen_id) === Number(screenId));
      return {
        ok:response.ok(),
        online:binding?.online === true,
        preview:binding?.preview_available === true,
        ping:Number(binding?.ping_ms),
        address:String(binding?.remote_address || '')
      };
    };
    await expect.poll(tvNetworkState, { timeout:10000 }).toMatchObject({
      ok:true,
      online:true,
      preview:true
    });
    const measured = await tvNetworkState();
    expect(measured.ping).toBeGreaterThanOrEqual(0);
    expect(measured.address).not.toBe('');

    await adminPage.goto('/screens');
    const tvCard = adminPage.locator(`[data-tv-unit][data-screen-id="${screenId}"]`);
    await expect(tvCard).toBeVisible();
    await expect(tvCard).toContainText('Онлайн · связь есть');
    await expect(tvCard).toContainText('Последняя связь');
    await expect(tvCard).toContainText('IP-адрес');
    await expect(tvCard.locator('.screen-tv-meta-row', { hasText:'Ping' }).locator('strong')).toContainText('мс');
    await expect(tvCard.locator('.screen-tv-face img')).toHaveCount(1);
    await tvCard.locator('.screen-tv-card').click();
    await expect(adminPage.locator('.screen-tv-preview-dialog')).toBeVisible();
    await expect(adminPage.locator('.screen-tv-preview-dialog')).toContainText('IP-адрес');
    await adminPage.locator('.screen-tv-preview-close').click();

    const liveText = `LIVE-E2E-${stamp}`;
    await expect(tvPage.locator('[data-scene-element-id="live-e2e-text"]')).toHaveCount(0);

    const editorResponse = await adminPage.request.get(`/api/screens/${screenId}/editor`);
    expect(editorResponse.ok()).toBeTruthy();
    const editor = await editorResponse.json();

    const deltaPromise = tvPage.waitForResponse(async (response) => {
      if (!response.url().endsWith('/api/device/player-delta') || response.request().method() !== 'POST') return false;
      try {
        const body = await response.json();
        return body?.changed?.scene?.elements?.some((element) =>
          element.id === 'live-e2e-text' && element.text?.runs?.[0]?.value === liveText
        );
      } catch {
        return false;
      }
    }, { timeout: 10000 });

    const saveResponse = await adminPage.request.put(`/api/screens/${screenId}/draft`, {
      data: {
        revision: editor.draft.revision,
        rows: editor.draft.rows,
        settings: editor.draft.settings,
        scene: textScene(liveText)
      }
    });
    expect(saveResponse.ok()).toBeTruthy();

    const deltaResponse = await deltaPromise;
    const delta = await deltaResponse.json();
    expect(delta.schema_version).toBe(4);
    expect(delta.changed.scene.elements[0].id).toBe('live-e2e-text');

    const sceneNode = tvPage.locator('[data-scene-element-id="live-e2e-text"]');
    await expect(sceneNode.locator('[data-scene-text] span')).toHaveText(liveText, { timeout: 5000 });
    await sceneNode.evaluate((node) => { node.dataset.identityProbe = 'stable-scene-node'; });

    const updatedEditor = await (await adminPage.request.get(`/api/screens/${screenId}/editor`)).json();
    const updatedText = `${liveText}-2`;
    const secondDelta = tvPage.waitForResponse(async (response) => {
      if (!response.url().endsWith('/api/device/player-delta') || response.request().method() !== 'POST') return false;
      try {
        const body = await response.json();
        return body?.changed?.scene?.elements?.[0]?.text?.runs?.[0]?.value === updatedText;
      } catch { return false; }
    }, { timeout: 10000 });
    const secondSave = await adminPage.request.put(`/api/screens/${screenId}/draft`, {
      data: {
        revision: updatedEditor.draft.revision,
        rows: updatedEditor.draft.rows,
        settings: updatedEditor.draft.settings,
        scene: textScene(updatedText)
      }
    });
    expect(secondSave.ok()).toBeTruthy();
    await secondDelta;

    await expect(sceneNode.locator('[data-scene-text] span')).toHaveText(updatedText, { timeout: 5000 });
    await expect(tvPage.locator('[data-scene-element-id="live-e2e-text"][data-identity-probe="stable-scene-node"]')).toHaveCount(1);
    await expect(tvPage.locator('[data-player-menu-layer] svg.menu-table-svg[data-identity-probe="stable-menu"]')).toHaveCount(1);
  } finally {
    if (screenId) await adminPage.request.delete(`/api/device-admin/bindings/${screenId}`).catch(() => undefined);
    if (locationId) await adminPage.request.delete(`/api/locations/${locationId}`).catch(() => undefined);
    await tvContext.close();
    await adminContext.close();
  }
});
