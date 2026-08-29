import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const COMPONENTS = ['screen', 'menu', 'animation', 'environment', 'scene_playlist', 'entity', 'brand', 'announcement', 'runtime'];

function hashes(suffix = 'a') {
  return Object.fromEntries(COMPONENTS.map((name) => [name, `${name}-${suffix}-012345678901234567890123456789`]));
}

function playerContext({ revision = 'revision-a', hashSuffix = 'a', entity = null, fallbackMs = 60_000 } = {}) {
  const stateHashes = hashes(hashSuffix);
  return {
    schema_version: 1,
    revision,
    hashes: stateHashes,
    screen: { id: 17, name: 'Экран 1', resolution: '1920x1080', status: 'active', location_id: 3, location_name: 'Точка 1', location_number: 1 },
    draft: { rows: [], settings: { background_color: '#101828' }, revision: 1 },
    products: [],
    packaging: [],
    animation: { enabled: false, profile: null },
    environment: null,
    scene_playlist: null,
    entity,
    brand: null,
    announcement: null,
    fallback_poll_interval_ms: fallbackMs,
    log_batch_size: 100,
    log_local_max_entries: 5000,
    log_local_max_bytes: 10 * 1024 * 1024
  };
}

async function seedLastKnownGood(page, context) {
  await page.goto('/signin');
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
  }, context);
}

async function installFailingWebSocket(page, { accelerateTimers = false } = {}) {
  await page.addInitScript(({ accelerate }) => {
    if (accelerate) {
      const nativeSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = (callback, delay = 0, ...args) => {
        const numeric = Number(delay) || 0;
        const effective = numeric >= 50_000 ? 1200 : Math.min(numeric, 300);
        return nativeSetTimeout(callback, effective, ...args);
      };
    }

    class FailingWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      constructor() {
        this.readyState = FailingWebSocket.CONNECTING;
        this.listeners = new Map();
        window.setTimeout(() => {
          if (this.readyState === FailingWebSocket.CLOSED) return;
          this.readyState = FailingWebSocket.CLOSED;
          this.emit('close', { code: 1006 });
        }, 20);
      }

      addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
      }

      emit(type, event) {
        for (const listener of this.listeners.get(type) || []) listener.call(this, event);
      }

      close() {
        if (this.readyState === FailingWebSocket.CLOSED) return;
        this.readyState = FailingWebSocket.CLOSED;
        this.emit('close', { code: 1000 });
      }
    }

    Object.defineProperty(window, 'WebSocket', { configurable: true, value: FailingWebSocket });
  }, { accelerate: accelerateTimers });
}

async function mockAuthorizedSession(page) {
  await page.route('**/api/device/session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ device_key: 'mira-device-key-1234567890', screen_id: 17 })
  }));
  await page.route('**/api/device/player-logs', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ accepted_through: 1000000 })
  }));
}

test('Last Known Good renders before a slow or unavailable server session check', async ({ page }) => {
  const context = playerContext();
  await seedLastKnownGood(page, context);
  await installFailingWebSocket(page);
  await page.route('**/api/device/session', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.abort('failed');
  });

  await page.goto('/player');
  await expect(page.locator('[data-flat-menu-canvas]')).toHaveCount(1, { timeout: 1000 });
  await expect(page.locator('[data-tv-player]')).not.toHaveClass(/is-hidden/);
  await expect(page.locator('[data-player-message]')).toContainText(/последнему рабочему состоянию|Нет связи/);
});

test('positive unauthorized response clears Last Known Good and returns to pairing', async ({ page }) => {
  await seedLastKnownGood(page, playerContext());
  await installFailingWebSocket(page);
  await page.route('**/api/device/session', (route) => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'unauthorized' })
  }));

  await page.goto('/player');
  await expect(page.locator('[data-activation-view]')).not.toHaveClass(/is-hidden/);
  await expect(page.getByRole('button', { name: 'Показать QR-код' })).toBeVisible();
  const lkg = await page.evaluate(async () => {
    const store = await import('/js/player/player-store.js');
    return store.loadLastKnownGood();
  });
  expect(lkg).toBeNull();
});

test('failed WebSocket reconnects never starve the rare REST fallback', async ({ page }) => {
  await installFailingWebSocket(page, { accelerateTimers: true });
  await mockAuthorizedSession(page);
  const context = playerContext({ fallbackMs: 60_000 });
  let deltaRequests = 0;

  await page.route('**/api/device/player-delta', async (route) => {
    deltaRequests += 1;
    const body = deltaRequests === 1
      ? { full_snapshot_required: true, context }
      : { schema_version: 1, revision: context.revision, hashes: context.hashes, changed: {}, unchanged: true };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto('/player');
  await expect(page.locator('[data-flat-menu-canvas]')).toHaveCount(1);
  await expect.poll(() => deltaRequests, { timeout: 4000 }).toBeGreaterThanOrEqual(2);
});

test('unchanged delta leaves the already rasterized menu canvas untouched', async ({ page }) => {
  await installFailingWebSocket(page, { accelerateTimers: true });
  await mockAuthorizedSession(page);
  const context = playerContext({ fallbackMs: 60_000 });
  let deltaRequests = 0;

  await page.route('**/api/device/player-delta', async (route) => {
    deltaRequests += 1;
    const body = deltaRequests === 1
      ? { full_snapshot_required: true, context }
      : { schema_version: 1, revision: context.revision, hashes: context.hashes, changed: {}, unchanged: true };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto('/player');
  const canvas = page.locator('[data-flat-menu-canvas]');
  await expect(canvas).toHaveCount(1);
  await canvas.evaluate((node) => { node.dataset.identityProbe = 'same-canvas'; });
  await expect.poll(() => deltaRequests, { timeout: 4000 }).toBeGreaterThanOrEqual(2);
  await expect(page.locator('[data-flat-menu-canvas][data-identity-probe="same-canvas"]')).toHaveCount(1);
});

test('menu-only delta does not recreate an unchanged Entity media node', async ({ page }) => {
  await installFailingWebSocket(page, { accelerateTimers: true });
  await mockAuthorizedSession(page);
  const entity = {
    version: 2,
    id: 'test-entity',
    name: 'Тестовый объект',
    asset_url: '/site-assets/entities/test.png',
    asset_type: 'image',
    media_type: 'image/png',
    width: 1,
    height: 1,
    visible: true,
    transform: { x: 1500, y: 300, width: 240, scale: 1, rotation: 0, depth: 10, opacity: 1 }
  };
  const first = playerContext({ revision: 'revision-a', hashSuffix: 'a', entity, fallbackMs: 60_000 });
  const secondHashes = { ...first.hashes, menu: 'menu-b-012345678901234567890123456789' };
  let deltaRequests = 0;

  await page.route('**/site-assets/entities/test.png', (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  }));
  await page.route('**/api/device/player-delta', async (route) => {
    deltaRequests += 1;
    const body = deltaRequests === 1
      ? { full_snapshot_required: true, context: first }
      : {
          schema_version: 1,
          revision: 'revision-b',
          hashes: secondHashes,
          changed: { menu: { draft: { rows: [], settings: { background_color: '#111827' }, revision: 2 }, products: [], packaging: [] } },
          unchanged: false
        };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto('/player');
  const entityMedia = page.locator('[data-motion-entity-layer] .animation-scene-entity-media');
  await expect(entityMedia).toHaveCount(1);
  await entityMedia.evaluate((node) => { node.dataset.identityProbe = 'same-entity'; });
  await expect.poll(() => deltaRequests, { timeout: 4000 }).toBeGreaterThanOrEqual(2);
  await expect(page.locator('[data-motion-entity-layer] .animation-scene-entity-media[data-identity-probe="same-entity"]')).toHaveCount(1);
});
