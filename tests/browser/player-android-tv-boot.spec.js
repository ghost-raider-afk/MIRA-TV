import { test, expect } from '@playwright/test';

test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 9; Android TV) AppleWebKit/537.36 Chrome/70.0.3538.110 Safari/537.36' });

const contextPayload = {
  schema_version: 4,
  revision: 'android-tv-boot-v1',
  render_revision: 1,
  hashes: {
    screen: 'screen-android-tv-012345678901234567890123456789',
    menu: 'menu-android-tv-012345678901234567890123456789',
    scene: 'scene-android-tv-012345678901234567890123456789',
    animation: 'animation-android-tv-012345678901234567890123456789',
    scene_playlist: 'playlist-android-tv-012345678901234567890123456789',
    runtime: 'runtime-android-tv-012345678901234567890123456789'
  },
  screen: {
    id: 77,
    name: 'Android TV',
    resolution: '1920x1080',
    status: 'active',
    location_id: 9,
    location_name: 'TV test',
    location_number: 1
  },
  draft: { rows: [], settings: { background_color: '#101828' }, revision: 1 },
  products: [],
  packaging: [],
  scene: { version: 1, elements: [] },
  animation: { enabled: false, profile: null },
  scene_playlist: null,
  app_version: '1.14.5',
  fallback_poll_interval_ms: 60000,
  log_batch_size: 100,
  log_local_max_entries: 5000,
  log_local_max_bytes: 10485760,
  metrics_interval_ms: 60000,
  preview_capture_interval_ms: 30000,
  preview_max_bytes: 262144
};

test('Android TV Player boots without AbortController support', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'AbortController', { configurable: true, value: undefined });
  });

  await page.route('**/api/device/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authorized: true, device_key: 'android-tv-device-key-1234567890', screen: { id: 77 } })
    })
  );
  await page.route('**/api/device/player-delta', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ full_snapshot_required: true, context: contextPayload })
    })
  );
  await page.route('**/api/device/player-logs', (route) =>
    route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ accepted_through: 999 }) })
  );

  await page.goto('/player');

  await expect(page.locator('[data-tv-player]')).not.toHaveClass(/is-hidden/, { timeout: 7000 });
  await expect(page.locator('[data-player-boot]')).toHaveClass(/is-hidden/);
  await expect(page.locator('[data-player-stage]')).toHaveCSS('background-color', 'rgb(16, 24, 40)');
});

test('pending Android TV activation never leaves a blank screen while status request is slow', async ({ page }) => {
  const pending = {
    activation_id: 'android-tv-pending-1234',
    poll_secret: 'android-tv-poll-secret-1234',
    device_key: 'android-tv-device-key-1234567890',
    reserve_code: '123456',
    qr_svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    expires_at: new Date(Date.now() + 120000).toISOString(),
    poll_interval_ms: 2000
  };

  await page.addInitScript((record) => {
    localStorage.setItem('mira-tv.device-activation.v2', JSON.stringify(record));
  }, pending);

  await page.route('**/api/device/session', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{}' })
  );
  await page.route('**/api/device/activations/*/status', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 6500));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'pending' }) });
  });

  await page.goto('/player');

  const boot = page.locator('[data-player-boot]');
  await expect(boot).toBeVisible();
  await expect(page.locator('[data-player-boot-status]')).toContainText('Проверяем сохранённое подключение телевизора', { timeout: 2500 });
  await expect(page.locator('[data-activation-view]')).toHaveClass(/is-hidden/);
  await expect(page.locator('[data-tv-player]')).toHaveClass(/is-hidden/);
});

test('Android TV shows a recovery message when Player module cannot start', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('mira-tv.player-boot-recovery.v1', '1');
  });
  await page.route('**/js/player/player.js', (route) => route.abort('failed'));

  await page.goto('/player');

  await expect(page.locator('[data-player-boot]')).toBeVisible();
  await expect(page.locator('[data-player-boot-status]')).toContainText(
    'MIRA-TV Player не запустился',
    { timeout: 10000 }
  );
});
