import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const CURRENT_APP_VERSION = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
).miraVersion;

test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 9; Android TV) AppleWebKit/537.36 Chrome/70.0.3538.110 Safari/537.36' });

const contextPayload = {
  schema_version: 7,
  revision: 'fullscreen:1',
  render_revision: 1,
  hashes: {
    screen: 'screen-fullscreen-012345678901234567890123456789',
    menu: 'menu-fullscreen-012345678901234567890123456789',
    scene: 'scene-fullscreen-012345678901234567890123456789',
    content_manifest: 'manifest-fullscreen-012345678901234567890123456789',
    runtime: 'runtime-fullscreen-012345678901234567890123456789'
  },
  screen: { id: 91, name: 'Fullscreen TV', resolution: '1920x1080', status: 'active' },
  draft: { rows: [], settings: { background_color: '#101828' }, revision: 1 },
  products: [],
  packaging: [],
  scene: { version: 1, elements: [] },
  content_manifest: { version: 1, revision: 'fullscreen:1', assets: [] },
  app_version: CURRENT_APP_VERSION,
  fallback_poll_interval_ms: 60000,
  metrics_interval_ms: 60000,
  preview_max_bytes: 262144
};

async function routePlayer(page) {
  await page.route('**/api/device/session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ authorized: true, device_key: 'fullscreen-device-key-1234567890', screen: { id: 91 } })
  }));
  await page.route('**/api/device/player-delta', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ full_snapshot_required: true, context: contextPayload })
  }));
  await page.route('**/api/device/player-logs', (route) => route.fulfill({
    status: 202,
    contentType: 'application/json',
    body: JSON.stringify({ accepted_through: 999 })
  }));
  await page.route('**/api/device/preview', (route) => route.fulfill({ status: 204, body: '' }));
}

test('active Android TV makes one legacy-compatible fullscreen request', async ({ page }) => {
  await page.addInitScript(() => {
    window.__miraFullscreenCalls = [];
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', {
      configurable: true,
      get: () => true
    });
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable: true,
      value: function (...args) {
        window.__miraFullscreenCalls.push(args.length);
        return Promise.resolve();
      }
    });
  });
  await routePlayer(page);

  await page.goto('/player');
  await expect(page.locator('[data-tv-player]')).not.toHaveClass(/is-hidden/, { timeout: 7000 });

  await expect.poll(() => page.evaluate(() => window.__miraFullscreenCalls.length)).toBe(1);
  expect(await page.evaluate(() => window.__miraFullscreenCalls[0])).toBe(0);

  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__miraFullscreenCalls.length)).toBe(1);
});

test('TV shows one brief hint and retries fullscreen only from OK after automatic rejection', async ({ page }) => {
  await page.addInitScript(() => {
    window.__miraFullscreenCalls = [];
    window.__miraFullscreenActive = false;
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', {
      configurable: true,
      get: () => true
    });
    Object.defineProperty(Document.prototype, 'fullscreenElement', {
      configurable: true,
      get: () => window.__miraFullscreenActive ? document.documentElement : null
    });
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable: true,
      value: function (...args) {
        window.__miraFullscreenCalls.push(args.length);
        if (window.__miraFullscreenCalls.length === 1) {
          const error = new Error('User gesture required');
          error.name = 'NotAllowedError';
          return Promise.reject(error);
        }
        window.__miraFullscreenActive = true;
        return Promise.resolve();
      }
    });
  });
  await routePlayer(page);

  await page.goto('/player');
  await expect(page.locator('[data-tv-player]')).not.toHaveClass(/is-hidden/, { timeout: 7000 });
  await expect.poll(() => page.evaluate(() => window.__miraFullscreenCalls.length)).toBe(1);

  const hint = page.locator('.player-fullscreen-hint');
  await expect(hint).toHaveText('Нажмите OK для полноэкранного режима');
  await expect(hint).toBeVisible();

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__miraFullscreenCalls.length)).toBe(1);

  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__miraFullscreenCalls.length)).toBe(2);
  expect(await page.evaluate(() => window.__miraFullscreenCalls[1])).toBe(0);
  await expect(hint).toHaveCount(0);
  expect(await page.evaluate(() => window.__miraFullscreenActive)).toBe(true);
});
