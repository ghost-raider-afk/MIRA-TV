import { test, expect } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';

function contextWithEntity() {
  const hashes = Object.fromEntries([
    'screen', 'menu', 'animation', 'environment', 'scene_playlist', 'entity', 'brand', 'announcement', 'runtime'
  ].map((name) => [name, `${name}-idle-012345678901234567890123456789`]));
  return {
    schema_version: 1,
    revision: 'entity-idle-revision',
    hashes,
    screen: { id: 17, name: 'Экран Entity', resolution: '1920x1080', location_id: 3, location_name: 'Точка 1', location_number: 1 },
    draft: { rows: [], settings: { background_color: '#101828' }, revision: 1 },
    products: [],
    packaging: [],
    animation: { enabled: false, profile: null },
    environment: null,
    scene_playlist: { enabled: false, menu_duration_seconds: 40, scenes: [] },
    entity: {
      version: 2,
      id: 'beer-glass',
      name: 'Бокал',
      asset_url: '/site-assets/entities/entity-idle.mp4',
      asset_type: 'video',
      media_type: 'video/mp4',
      width: 720,
      height: 1280,
      loop: true,
      muted: true,
      playsinline: true,
      playback_rate: 1,
      visible: true,
      transform: { x: 1500, y: 300, width: 240, scale: 1, rotation: 0, depth: 10, opacity: 1 }
    },
    brand: null,
    announcement: null,
    fallback_poll_interval_ms: 60000,
    log_batch_size: 100,
    log_local_max_entries: 5000,
    log_local_max_bytes: 10485760
  };
}

test('base Entity video and WAAPI runtime stop when Player is hidden or fullscreen suppresses it', async ({ browser }) => {
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    window.__miraMediaOps = { play: 0, pause: 0 };
    HTMLMediaElement.prototype.play = function play() {
      window.__miraMediaOps.play += 1;
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      window.__miraMediaOps.pause += 1;
    };

    class FakeWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      constructor() {
        super();
        this.readyState = FakeWebSocket.CONNECTING;
        setTimeout(() => {
          if (this.readyState !== FakeWebSocket.CONNECTING) return;
          this.readyState = FakeWebSocket.OPEN;
          this.dispatchEvent(new Event('open'));
        }, 20);
      }
      close() {
        if (this.readyState === FakeWebSocket.CLOSED) return;
        this.readyState = FakeWebSocket.CLOSED;
        this.dispatchEvent(new Event('close'));
      }
    }
    window.WebSocket = FakeWebSocket;
  });

  const page = await context.newPage();
  const playerContext = contextWithEntity();
  let deltaRequests = 0;

  try {
    await page.route('**/api/device/session', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ device_key: 'entity-idle-device-key-123456', screen_id: 17 })
    }));
    await page.route('**/api/device/player-logs', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accepted_through: 100000 })
    }));
    await page.route('**/api/device/player-delta', (route) => {
      deltaRequests += 1;
      const body = deltaRequests === 1
        ? { full_snapshot_required: true, context: playerContext }
        : { unchanged: true, schema_version: 1, revision: playerContext.revision, hashes: playerContext.hashes };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.route('**/site-assets/entities/entity-idle.mp4', (route) => route.fulfill({
      status: 200,
      contentType: 'video/mp4',
      body: ''
    }));

    await page.goto('/player');
    await expect(page.locator('[data-motion-entity-layer] video')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.__miraMediaOps.play)).toBeGreaterThan(0);

    const beforeFullscreenPause = await page.evaluate(() => window.__miraMediaOps.pause);
    await page.locator('[data-player-stage]').evaluate((stage) => {
      stage.dispatchEvent(new CustomEvent('mira:scene-playlist-mode', { detail: { fullscreen: true } }));
    });
    await expect.poll(() => page.evaluate(() => window.__miraMediaOps.pause)).toBeGreaterThan(beforeFullscreenPause);

    const beforeResumePlay = await page.evaluate(() => window.__miraMediaOps.play);
    await page.locator('[data-player-stage]').evaluate((stage) => {
      stage.dispatchEvent(new CustomEvent('mira:scene-playlist-mode', { detail: { fullscreen: false } }));
    });
    await expect.poll(() => page.evaluate(() => window.__miraMediaOps.play)).toBeGreaterThan(beforeResumePlay);

    const beforeInactivePause = await page.evaluate(() => window.__miraMediaOps.pause);
    await page.locator('[data-player-stage]').evaluate((stage) => {
      stage.dispatchEvent(new CustomEvent('mira:player-active', { detail: { active: false } }));
    });
    await expect.poll(() => page.evaluate(() => window.__miraMediaOps.pause)).toBeGreaterThan(beforeInactivePause);
  } finally {
    await context.close();
  }
});
