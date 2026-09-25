import { test, expect } from '@playwright/test';

test.use({
  serviceWorkers: 'block',
  userAgent: 'Mozilla/5.0 (Linux; Android 9; Android TV) AppleWebKit/537.36 Chrome/84.0.4147.125 Safari/537.36'
});

const hashes = Object.fromEntries(
  ['screen', 'menu', 'scene', 'animation', 'scene_playlist', 'runtime']
    .map((name) => [name, `${name}-android-tv-compat-012345678901234567890123`])
);

function playerContext() {
  return {
    schema_version: 4,
    revision: 'android-tv-compat-v1',
    render_revision: 1,
    hashes,
    screen: {
      id: 17,
      name: 'Android TV',
      resolution: '1920x1080',
      status: 'active',
      location_id: 3,
      location_name: 'Точка',
      location_number: 1
    },
    draft: {
      revision: 1,
      settings: {
        background_color: '#101828',
        font_family: 'dejavu-condensed'
      },
      rows: [
        { id: 'section-1', kind: 'section', name: 'Напитки', enabled: true },
        { id: 'pack-1', kind: 'packaging', packaging_id: 1, enabled: true },
        { id: 'pack-2', kind: 'packaging', packaging_id: 2, enabled: true }
      ]
    },
    products: [],
    packaging: [
      { id: 1, name: 'Бутылка', unit_price: '10' },
      { id: 2, name: 'ПЭТ', unit_price: '20' }
    ],
    scene: { version: 1, elements: [] },
    animation: { enabled: false, profile: null },
    scene_playlist: { enabled: false, animation_enabled: true, menu_duration_seconds: 40, scenes: [] },
    app_version: '1.14.5',
    fallback_poll_interval_ms: 60_000,
    log_batch_size: 100,
    log_local_max_entries: 5000,
    log_local_max_bytes: 10 * 1024 * 1024
  };
}

async function emulateOlderAndroidTvApis(page) {
  await page.addInitScript(() => {
    Object.defineProperty(String.prototype, 'replaceAll', { configurable: true, writable: true, value: undefined });
    Object.defineProperty(Array.prototype, 'at', { configurable: true, writable: true, value: undefined });
    Object.defineProperty(globalThis, 'structuredClone', { configurable: true, writable: true, value: undefined });
    Object.defineProperty(Element.prototype, 'replaceChildren', { configurable: true, writable: true, value: undefined });
  });
}

test('Player renders on Android TV Chromium without newer JS and DOM APIs', async ({ page }) => {
  await emulateOlderAndroidTvApis(page);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.route('**/api/device/session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ authorized: true, device_key: 'mira-device-key-android-tv-1234567890', screen_id: 17 })
  }));
  await page.route('**/api/device/player-delta', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ full_snapshot_required: true, context: playerContext() })
  }));
  await page.route('**/api/device/player-logs', (route) => route.fulfill({ status: 202, contentType: 'application/json', body: '{"accepted_through":1000}' }));
  await page.route('**/api/device/metrics', (route) => route.fulfill({ status: 202, contentType: 'application/json', body: '{"accepted":true}' }));
  await page.route('**/api/device/preview', (route) => route.fulfill({ status: 202, contentType: 'application/json', body: '{"accepted":true}' }));

  await page.goto('/player');

  await expect(page.locator('[data-tv-player]')).not.toHaveClass(/is-hidden/);
  await expect(page.locator('[data-player-menu-layer] svg.menu-table-svg')).toHaveCount(1);
  await expect(page.locator('[data-player-menu-layer] .packaging-cell')).toHaveCount(2);
  await expect(page.locator('[data-player-menu-layer]')).toContainText('Напитки');

  const unsupported = await page.evaluate(() => ({
    replaceAll: typeof String.prototype.replaceAll,
    arrayAt: typeof Array.prototype.at,
    structuredClone: typeof globalThis.structuredClone,
    replaceChildren: typeof Element.prototype.replaceChildren
  }));
  expect(unsupported).toEqual({
    replaceAll: 'undefined',
    arrayAt: 'undefined',
    structuredClone: 'undefined',
    replaceChildren: 'undefined'
  });
  expect(errors).toEqual([]);
});

test('Player never leaves Android TV on a blank screen while a saved pairing is being checked', async ({ page }) => {
  await emulateOlderAndroidTvApis(page);
  await page.addInitScript(() => {
    localStorage.setItem('mira-tv.device-activation.v2', JSON.stringify({
      activation_id: 'android-tv-pending-activation',
      poll_secret: 'android-tv-pending-secret',
      reserve_code: '123456',
      device_key: 'mira-device-key-android-tv-1234567890',
      expires_at: new Date(Date.now() + 120_000).toISOString(),
      poll_interval_ms: 2000
    }));
  });

  await page.route('**/api/device/session', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: '{"error":"temporary"}'
  }));
  await page.route('**/api/device/activations/*/status', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"pending"}' });
  });

  await page.goto('/player');

  const boot = page.locator('[data-player-boot]');
  await expect(boot).toBeVisible();
  await expect(page.locator('[data-player-boot-status]')).toContainText('Проверяем сохранённое подключение');
  await expect(page.locator('[data-activation-view]')).toHaveClass(/is-hidden/);
  await expect(page.locator('[data-tv-player]')).toHaveClass(/is-hidden/);
});
