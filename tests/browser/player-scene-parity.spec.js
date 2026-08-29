import { test, expect } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';

function playerContext(version) {
  const second = version > 1;
  return {
    schema_version: 1,
    revision: second ? 'scene-parity-v2' : 'scene-parity-v1',
    hashes: {
      screen: 'screen-v1',
      menu: 'menu-v1',
      animation: 'animation-v1',
      environment: second ? 'environment-v2' : 'environment-v1',
      scene_playlist: 'playlist-v1',
      entity: 'entity-v1',
      brand: second ? 'brand-v2' : 'brand-v1',
      announcement: 'announcement-v1',
      runtime: 'runtime-v1'
    },
    screen: { id: 1, name: 'ТВ 1', resolution: '1920x1080', location_id: 1, location_name: 'Точка 1', location_number: 1 },
    draft: { rows: [], settings: { background_color: '#123456' }, revision: 1 },
    products: [],
    packaging: [],
    animation: { enabled: false, profile: null },
    entity: null,
    announcement: null,
    brand: {
      enabled: true,
      text: second ? 'НОВЫЙ\nБРЕНД' : 'ПЕРВЫЙ\nБРЕНД',
      x: 960,
      y: 96,
      font_family: 'inter',
      font_size: 72,
      vertical_scale: 1,
      line_spacing: second ? -24 : -12,
      letter_spacing: 2,
      text_color: '#FFFFFF',
      glow_color: '#35D9FF',
      glow_strength: 18,
      entrance_effect: 'none',
      loop_effect: 'none',
      exit_effect: 'none',
      entrance_duration_ms: 900,
      exit_duration_ms: 550,
      letter_stagger_ms: 0,
      amplitude_px: 0,
      overshoot: 0,
      cycle_seconds: 5.5,
      effect: 'none'
    },
    environment: {
      enabled: true,
      effect: 'aquarium',
      parameters: {
        style: second ? 'neon' : 'premium',
        intro_fill: false,
        intensity: 45,
        fish_count: second ? 4 : 2,
        bubble_density: 0,
        plant_density: 0,
        caustics: 0,
        speed: 35
      }
    },
    scene_playlist: { enabled: false, menu_duration_seconds: 40, scenes: [] },
    fallback_poll_interval_ms: 60000,
    log_batch_size: 100,
    log_local_max_entries: 5000,
    log_local_max_bytes: 10485760
  };
}

test('TV Player updates Brand and environment from WebSocket invalidation without rebuilding unrelated layers', async ({ browser }) => {
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    class FakeWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      constructor(url) {
        super();
        this.url = url;
        this.readyState = FakeWebSocket.CONNECTING;
        window.__miraTestSockets ||= [];
        window.__miraTestSockets.push(this);
        setTimeout(() => {
          if (this.readyState !== FakeWebSocket.CONNECTING) return;
          this.readyState = FakeWebSocket.OPEN;
          this.dispatchEvent(new Event('open'));
        }, 25);
      }

      close() {
        if (this.readyState === FakeWebSocket.CLOSED) return;
        this.readyState = FakeWebSocket.CLOSED;
        this.dispatchEvent(new Event('close'));
      }

      emit(message) {
        this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
      }
    }
    window.WebSocket = FakeWebSocket;
  });

  const page = await context.newPage();
  let requests = 0;
  const first = playerContext(1);
  const second = playerContext(2);
  try {
    await page.route('**/api/device/session', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authorized: true,
        device_id: 1,
        device_key: 'device-key-scene-parity-123456',
        session_expires_at: new Date(Date.now() + 86400000).toISOString(),
        screen: first.screen
      })
    }));
    await page.route('**/api/device/player-logs', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accepted_through: 100000 })
    }));
    await page.route('**/api/device/player-delta', (route) => {
      requests += 1;
      if (requests === 1) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ full_snapshot_required: true, context: first })
        });
      }
      if (requests === 2) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ unchanged: true, schema_version: 1, revision: first.revision, hashes: first.hashes })
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schema_version: 1,
          revision: second.revision,
          hashes: second.hashes,
          changed: { environment: second.environment, brand: second.brand }
        })
      });
    });

    await page.goto('/player');

    const environment = page.locator('[data-player-environment-layer]');
    const brand = page.locator('[data-brand-layer] .scene-brand-title');
    const menu = page.locator('[data-player-menu-layer] canvas');
    await expect(environment).toHaveClass(/environment-effect-aquarium/);
    await expect(environment.locator('.aquarium-fish')).toHaveCount(2);
    await expect(brand.locator('.scene-brand-title-line')).toHaveCount(2);
    await expect(brand).toHaveAttribute('aria-label', 'ПЕРВЫЙ\nБРЕНД');
    expect(await brand.evaluate((node) => node.style.getPropertyValue('--brand-line-spacing'))).toBe('-0.625cqw');
    await expect(menu).toHaveCount(1);
    await menu.evaluate((node) => { node.dataset.identityProbe = 'stable-menu'; });

    await expect.poll(() => requests).toBeGreaterThanOrEqual(2);
    await page.evaluate(() => {
      window.__miraTestSockets?.[0]?.emit({ type: 'context.changed', revision: 'scene-parity-v2' });
    });

    await expect.poll(() => requests).toBeGreaterThanOrEqual(3);
    await expect(environment).toHaveClass(/aquarium-style-neon/);
    await expect(environment.locator('.aquarium-fish')).toHaveCount(4);
    await expect(brand).toHaveAttribute('aria-label', 'НОВЫЙ\nБРЕНД');
    expect(await brand.evaluate((node) => node.style.getPropertyValue('--brand-line-spacing'))).toBe('-1.25cqw');
    await expect(page.locator('[data-player-menu-layer] canvas[data-identity-probe="stable-menu"]')).toHaveCount(1);
  } finally {
    await context.close();
  }
});
