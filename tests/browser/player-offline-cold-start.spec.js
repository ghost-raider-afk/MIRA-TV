import { test, expect } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';

function offlineContext() {
  const names = ['screen', 'menu', 'scene', 'content_manifest', 'runtime'];
  const hashes = Object.fromEntries(names.map((name) => [name, `${name}-offline-012345678901234567890123456789`]));
  return {
    schema_version: 7,
    revision: '7:1',
    render_revision: 1,
    hashes,
    screen: { id:17, name:'Офлайн ТВ', resolution:'1920x1080', status:'active', location_id:3, location_name:'Точка', location_number:1 },
    draft: { rows:[], settings:{ background_color:'#123456' }, revision:7 },
    products: [],
    packaging: [],
    scene: { version:1, elements:[] },
    content_manifest: { version:1, revision:'7:1', assets:[] },
    app_version: '1.15.1',
    fallback_poll_interval_ms: 60000,
    log_batch_size: 100,
    log_local_max_entries: 5000,
    log_local_max_bytes: 10485760,
    metrics_interval_ms: 60000,
    preview_max_bytes: 1048576
  };
}

test('TV cold-starts the last working screen after a browser restart with no network', async ({ browser }) => {
  const context = await browser.newContext({ baseURL, serviceWorkers:'allow' });
  const page = await context.newPage();
  const saved = offlineContext();

  try {
    await page.route('**/api/device/session', (route) => route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({
        authorized:true,
        device_id:17,
        device_key:'offline-cold-start-device',
        session_expires_at:new Date(Date.now() + 86_400_000).toISOString(),
        screen:saved.screen
      })
    }));
    await page.route('**/api/device/player-delta', (route) => route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({ full_snapshot_required:true, context:saved })
    }));
    await page.route('**/api/device/player-logs', (route) => route.fulfill({
      status:202,
      contentType:'application/json',
      body:'{"accepted_through":1000}'
    }));
    await page.route('**/api/device/metrics', (route) => route.fulfill({
      status:202,
      contentType:'application/json',
      body:'{"accepted":true}'
    }));

    await page.goto('/player');
    await expect(page.locator('[data-tv-player]')).not.toHaveClass(/is-hidden/);
    await expect(page.locator('[data-player-menu-layer] svg.menu-table-svg')).toHaveCount(1);
    await expect(page.locator('[data-player-stage]')).toHaveCSS('background-color', 'rgb(18, 52, 86)');

    await expect.poll(() => page.evaluate(async () => {
      const store = await import('/js/player/player-store.js');
      const record = await store.loadLastKnownGood();
      return record?.revision || '';
    }), { timeout:5000 }).toBe('7:1');

    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.goto('/signin');

    await page.unroute('**/api/device/session');
    await page.unroute('**/api/device/player-delta');
    await page.unroute('**/api/device/player-logs');
    await page.unroute('**/api/device/metrics');

    await context.setOffline(true);
    await page.goto('/player', { waitUntil:'domcontentloaded' });

    await expect(page.locator('[data-tv-player]')).not.toHaveClass(/is-hidden/);
    await expect(page.locator('[data-player-menu-layer] svg.menu-table-svg')).toHaveCount(1);
    await expect(page.locator('[data-player-stage]')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
    await expect(page.locator('[data-player-message]')).toContainText(/последнему рабочему состоянию|Нет связи/);
  } finally {
    await context.setOffline(false).catch(() => {});
    await context.close();
  }
});
