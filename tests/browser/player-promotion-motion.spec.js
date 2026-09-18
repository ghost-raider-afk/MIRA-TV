import { test, expect } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';

const PROFILE = {
  motion_version: 3,
  pattern: 'cinematic', flow_direction: 'alternate', easing: 'cinematic', cycle_seconds: 8.5,
  event_duration_ms: 6900, wave_stagger_ms: 180, travel_px: 28, scale_amount: 0.042,
  brightness_amount: 0.26, section_effect: 'cinematic', item_effect: 'cinematic', price_effect: 'none', intensity: 80,
  promotion_effect: 'cinematic', promotion_intensity: 96, promotion_cycle_seconds: 4.8,
  promotion_event_duration_ms: 1800, promotion_travel_px: 0, promotion_scale_amount: 0.06,
  promotion_brightness_amount: 0.35, promotion_glow_radius: 28, promotion_easing: 'smooth'
};

function playerContext() {
  return {
    schema_version: 2,
    revision: 'promotion-tv-v1',
    hashes: {
      screen: 'screen-v1', menu: 'menu-v1', animation: 'animation-v1', environment: 'environment-v1',
      scene_playlist: 'playlist-v1', entity: 'entity-v1', brand: 'brand-v1', announcement: 'announcement-v1',
      weather: 'weather-v1', runtime: 'runtime-v1'
    },
    screen: { id: 1, name: 'ТВ Акция', resolution: '1920x1080', location_id: 1, location_name: 'Точка', location_number: 1 },
    draft: {
      rows: [
        { id: 'section', kind: 'section', name: 'МЕНЮ', enabled: true },
        { id: 'promo', kind: 'item', name: 'Акционная позиция', price_primary: '240', price_secondary: '360', promotion: true, promotion_text: 'АКЦИЯ', enabled: true }
      ],
      settings: { background_color: '#101828', accent_color: '#F4C915', text_color: '#F8FAFC' },
      revision: 1
    },
    products: [], packaging: [],
    animation: { enabled: true, profile: PROFILE },
    environment: null,
    scene_playlist: { enabled: false, menu_duration_seconds: 40, scenes: [] },
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

test('TV Player uses the same unified promotion motion as Preview', async ({ browser }) => {
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    class FakeWebSocket extends EventTarget {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      constructor(url) {
        super(); this.url = url; this.readyState = FakeWebSocket.CONNECTING;
        setTimeout(() => { this.readyState = FakeWebSocket.OPEN; this.dispatchEvent(new Event('open')); }, 10);
      }
      close() { this.readyState = FakeWebSocket.CLOSED; this.dispatchEvent(new Event('close')); }
      send() {}
    }
    window.WebSocket = FakeWebSocket;
  });

  const page = await context.newPage();
  const snapshot = playerContext();
  let deltaRequests = 0;
  try {
    await page.route('**/api/device/session', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authorized: true,
        device_id: 1,
        device_key: 'device-key-promotion-motion-123456',
        session_expires_at: new Date(Date.now() + 86400000).toISOString(),
        screen: snapshot.screen
      })
    }));
    await page.route('**/api/device/player-logs', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ accepted_through: 100000 })
    }));
    await page.route('**/api/device/player-delta', (route) => {
      deltaRequests += 1;
      if (deltaRequests === 1) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ full_snapshot_required: true, context: snapshot }) });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ unchanged: true, schema_version: 2, revision: snapshot.revision, hashes: snapshot.hashes })
      });
    });

    await page.goto('/player');
    const row = page.locator('[data-player-menu-layer] g.table-item').first();
    const surface = row.locator(':scope > .row-motion-surface-item');
    const badge = row.locator(':scope > g.promotion-badge');
    const glow = row.locator(':scope > g.promotion-row-glow');
    await expect(surface).toHaveAttribute('data-motion', 'item');
    await expect(badge).toHaveAttribute('data-motion', 'promotion');
    await expect(glow).toHaveAttribute('data-motion', 'promotion-glow');
    await expect.poll(() => surface.evaluate((node) => getComputedStyle(node).transform)).not.toBe('none');
    await expect.poll(() => glow.evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity))).toBeGreaterThan(0);
    await expect.poll(() => badge.evaluate((node) => getComputedStyle(node).transform)).not.toBe('none');
    expect(await surface.evaluate((node) => node.getAnimations().length)).toBe(0);
    expect(await badge.evaluate((node) => node.getAnimations().length)).toBe(0);
    await expect(page.locator('[data-player-stage]')).toHaveAttribute('data-motion-mode', 'wasm-continuous');
  } finally {
    await context.close();
  }
});
