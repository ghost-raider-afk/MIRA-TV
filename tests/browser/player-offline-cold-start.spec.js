import { test, expect } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';

function offlineContext() {
  const names = ['screen', 'menu', 'animation', 'environment', 'scene_playlist', 'entity', 'brand', 'announcement', 'weather', 'runtime'];
  const hashes = Object.fromEntries(names.map((name) => [name, `${name}-offline-012345678901234567890123456789`]));
  return {
    schema_version: 2,
    revision: 'offline-cold-start-v1',
    hashes,
    screen: { id: 17, name: 'Офлайн ТВ', resolution: '1920x1080', status: 'active', location_id: 3, location_name: 'Точка', location_number: 1 },
    draft: { rows: [], settings: { background_color: '#123456' }, revision: 7 },
    products: [],
    packaging: [],
    animation: { enabled: false, profile: null },
    environment: null,
    scene_playlist: null,
    entity: null,
    brand: null,
    announcement: null,
    weather: null,
    fallback_poll_interval_ms: 60000,
    log_batch_size: 100,
    log_local_max_entries: 5000,
    log_local_max_bytes: 10485760
  };
}

test('TV cold-starts the last working screen after a browser restart with no network', async ({ browser }) => {
  const context = await browser.newContext({ baseURL, serviceWorkers: 'allow' });
  const page = await context.newPage();
  try {
    // Prime the Player shell and let its Service Worker take control of the origin.
    // The temporary responses below only keep the pairing screen quiet while the shell is installed.
    await page.route('**/api/device/session', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
    await page.route('**/api/device/activations', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await page.goto('/player');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.goto('/signin');

    const saved = offlineContext();
    await page.evaluate(async (value) => {
      const store = await import('/js/player/player-store.js');
      await store.saveLastKnownGood({
        schema_version: value.schema_version,
        revision: value.revision,
        hashes: value.hashes,
        screen_id: value.screen.id,
        saved_at: new Date().toISOString(),
        context: value
      });
    }, saved);

    // A real network outage produces no HTTP response. Leaving the mocked 401 installed here would
    // correctly tell Player that authorization was revoked and would therefore invalidate the LKG.
    await page.unroute('**/api/device/session');
    await page.unroute('**/api/device/activations');
    await context.setOffline(true);
    await page.goto('/player', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-tv-player]')).not.toHaveClass(/is-hidden/);
    await expect(page.locator('[data-player-menu-layer] svg.menu-table-svg')).toHaveCount(1);
    await expect(page.locator('[data-player-stage]')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
    await expect(page.locator('[data-player-message]')).toContainText(/последнему рабочему состоянию|Нет связи/);
  } finally {
    await context.setOffline(false).catch(() => {});
    await context.close();
  }
});
