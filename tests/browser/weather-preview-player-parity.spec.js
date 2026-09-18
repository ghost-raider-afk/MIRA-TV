import { test, expect } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';

async function login(page) {
  await page.goto('/signin.html');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || '');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name: /войти/i }).click()
  ]);
}

async function normalizedWeatherGeometry(page, layerSelector) {
  return page.locator(layerSelector).evaluate((layer) => {
    const widget = layer.querySelector('.weather-widget');
    if (!(widget instanceof HTMLElement)) return null;
    const layerRect = layer.getBoundingClientRect();
    const widgetRect = widget.getBoundingClientRect();
    const sceneScale = Number(layer.dataset.weatherSceneScale) || 1;
    return {
      sceneScale,
      centerX: (widgetRect.left + widgetRect.width / 2 - layerRect.left) / sceneScale,
      centerY: (widgetRect.top + widgetRect.height / 2 - layerRect.top) / sceneScale,
      width: widgetRect.width / sceneScale,
      height: widgetRect.height / sceneScale
    };
  });
}

test('Weather keeps canonical 1920x1080 geometry between Preview and Player', async ({ browser }) => {
  const admin = await browser.newContext({ baseURL, viewport: { width: 1600, height: 900 } });
  const adminPage = await admin.newPage();
  let locationId = null;
  try {
    await login(adminPage);
    const stamp = Date.now();
    const locationResponse = await adminPage.request.post('/api/locations', { data: { name: `Weather parity ${stamp}`, address: '', active: true } });
    expect(locationResponse.ok()).toBeTruthy();
    const location = await locationResponse.json();
    locationId = location.id;
    const screenResponse = await adminPage.request.post(`/api/locations/${locationId}/screens`, { data: {} });
    expect(screenResponse.ok()).toBeTruthy();
    const screen = await screenResponse.json();

    await adminPage.goto(`/playlist?screen=${screen.id}`);
    await adminPage.locator('#animation-object-settings-select').selectOption('weather');
    const weatherObject = adminPage.locator('[data-animation-object="weather"]');
    const visibleToggle = weatherObject.locator('[data-animation-object-toggle="visible"]');
    if (!(await visibleToggle.isChecked())) await visibleToggle.check();

    await adminPage.locator('#weather-x').fill('700');
    await adminPage.locator('#weather-y').fill('315');
    await adminPage.locator('#weather-width').fill('420');
    await adminPage.locator('#weather-scale').fill('1.25');

    const layer = adminPage.locator('#animation-stage [data-weather-layer]');
    const widget = layer.locator('.weather-widget');
    await expect(widget).toBeVisible();
    const sceneScale = Number(await layer.getAttribute('data-weather-scene-scale'));
    expect(sceneScale).toBeGreaterThan(0);
    expect(sceneScale).toBeLessThan(1);

    const layerBox = await layer.boundingBox();
    const widgetBox = await widget.boundingBox();
    expect(layerBox).not.toBeNull();
    expect(widgetBox).not.toBeNull();
    const target = { x: 1040, y: 620 };
    await adminPage.mouse.move(widgetBox.x + widgetBox.width / 2, widgetBox.y + widgetBox.height / 2);
    await adminPage.mouse.down();
    await adminPage.mouse.move(layerBox.x + target.x * sceneScale, layerBox.y + target.y * sceneScale);
    await adminPage.mouse.up();
    await expect.poll(async () => Number(await adminPage.locator('#weather-x').inputValue())).toBeCloseTo(target.x, 0);
    await expect.poll(async () => Number(await adminPage.locator('#weather-y').inputValue())).toBeCloseTo(target.y, 0);

    const previewGeometry = await normalizedWeatherGeometry(adminPage, '#animation-stage [data-weather-layer]');
    expect(previewGeometry).not.toBeNull();

    const player = await browser.newContext({ baseURL, viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
    const playerPage = await player.newPage();
    await player.addInitScript(() => {
      class FakeWebSocket extends EventTarget {
        static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
        constructor() {
          super(); this.readyState = FakeWebSocket.CONNECTING;
          setTimeout(() => { this.readyState = FakeWebSocket.OPEN; this.dispatchEvent(new Event('open')); }, 10);
        }
        close() { this.readyState = FakeWebSocket.CLOSED; this.dispatchEvent(new Event('close')); }
        send() {}
      }
      window.WebSocket = FakeWebSocket;
    });

    const weather = {
      enabled: true, screen_id: screen.id, location_name: 'Хельсинки',
      latitude: null, longitude: null, timezone: 'auto', position: 'top-right',
      x: target.x, y: target.y, width_px: 420, scale: 1.25, opacity: .96,
      refresh_minutes: 15, animation_enabled: false, animation_speed: 1,
      animation_intensity: 1, widget_motion_enabled: false,
      show_condition: true, show_feels_like: true, show_humidity: true,
      show_wind: true, show_forecast: true, forecast_items: 3
    };
    const snapshot = {
      location_name: 'Хельсинки', temperature: 18, apparent_temperature: 17,
      humidity: 64, wind_speed: 12, weather_code: 61, is_day: true,
      condition: 'Дождь', icon: 'rain', updated_at: new Date().toISOString(),
      forecast: [
        { time: '2026-09-07T14:00', temperature: 19, icon: 'rain', precipitation_probability: 70 },
        { time: '2026-09-07T16:00', temperature: 17, icon: 'cloud', precipitation_probability: 35 },
        { time: '2026-09-07T18:00', temperature: 15, icon: 'partly-cloudy', precipitation_probability: 20 }
      ]
    };
    const hashes = Object.fromEntries(['screen','menu','animation','environment','scene_playlist','entity','weather','brand','announcement','runtime']
      .map((name) => [name, `${name}-weather-parity-012345678901234567890123`]));
    const state = {
      schema_version: 2, revision: 'weather-parity-v1', hashes,
      screen: { ...screen, resolution: '1920x1080' },
      draft: { rows: [], settings: { background_color: '#101828' }, revision: 1 },
      products: [], packaging: [], animation: { enabled: false, profile: null },
      environment: null, scene_playlist: null, entity: null, brand: null, announcement: null, weather,
      fallback_poll_interval_ms: 60000, log_batch_size: 100, log_local_max_entries: 5000,
      log_local_max_bytes: 10485760, app_version: '1.10.2'
    };
    let deltaRequests = 0;
    await playerPage.route('**/api/device/session', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ authorized: true, device_id: 1, device_key: 'weather-parity-device', session_expires_at: new Date(Date.now() + 86400000).toISOString(), screen: state.screen })
    }));
    await playerPage.route('**/api/device/player-logs', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accepted_through: 9999 }) }));
    await playerPage.route('**/api/device/player-delta', (route) => {
      deltaRequests += 1;
      const body = deltaRequests === 1
        ? { full_snapshot_required: true, context: state }
        : { unchanged: true, schema_version: 2, revision: state.revision, hashes: state.hashes };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await playerPage.route('**/api/device/weather', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings: weather, snapshot }) }));

    await playerPage.goto('/player');
    const playerLayer = playerPage.locator('[data-player-stage] [data-weather-layer]');
    await expect(playerLayer.locator('.weather-widget')).toBeVisible();
    await expect(playerLayer).toHaveAttribute('data-weather-scene-scale', '1');
    const playerGeometry = await normalizedWeatherGeometry(playerPage, '[data-player-stage] [data-weather-layer]');
    expect(playerGeometry).not.toBeNull();

    for (const key of ['centerX', 'centerY', 'width', 'height']) {
      expect(Math.abs(previewGeometry[key] - playerGeometry[key]), key).toBeLessThan(1.5);
    }
    await player.close();
  } finally {
    if (locationId) await adminPage.request.delete(`/api/locations/${locationId}`).catch(() => undefined);
    await admin.close();
  }
});
