import { test, expect } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';
const MiB = 1024 * 1024;

function contextSnapshot() {
  const products = Array.from({ length: 8 }, (_value, index) => ({
    id: index + 1,
    name: `Позиция ${index + 1}`,
    producer: index % 2 ? 'MIRA Brewery' : 'MIRA Kitchen',
    strength: index < 4 ? '4.7' : '',
    beverage_color: index < 4 ? 'light' : null,
    filtration: index < 4 ? 'filtered' : null,
    price_primary: String(250 + index * 10),
    price_secondary: String(340 + index * 10)
  }));
  const packaging = [{ id: 1, name: 'Бутылка 1 л', unit_price: '120' }, { id: 2, name: 'ПЭТ 1,5 л', unit_price: '90' }];
  const rows = [
    { id: 'section-1', kind: 'section', name: 'Разливные напитки', enabled: true },
    ...products.map((product, index) => ({ id: `item-${product.id}`, kind: 'item', product_id: product.id, enabled: true, promotion: index === 1, promotion_text: index === 1 ? 'ХИТ' : '' })),
    { id: 'section-2', kind: 'section', name: 'Тара', enabled: true },
    { id: 'pack-1', kind: 'packaging', packaging_id: 1, enabled: true },
    { id: 'pack-2', kind: 'packaging', packaging_id: 2, enabled: true }
  ];
  const hashes = Object.fromEntries(['screen', 'menu', 'animation', 'environment', 'scene_playlist', 'entity', 'brand', 'announcement', 'weather', 'runtime'].map((name) => [name, `${name}-runtime-audit-012345678901234567890123456789`]));
  return {
    schema_version: 2,
    revision: 'runtime-audit-v1',
    hashes,
    screen: { id: 77, name: 'TV Runtime Audit', resolution: '1920x1080', status: 'active', location_id: 7, location_name: 'Тестовая точка', location_number: 1 },
    draft: {
      revision: 1,
      settings: {
        background_color: '#101828',
        accent_color: '#F4C915',
        text_color: '#F8FAFC',
        font_family: 'arial-narrow',
        font_scale_percent: 100,
        table_x: 56,
        table_y: 15,
        table_width_px: 1374,
        table_height_px: 925
      },
      rows
    },
    products,
    packaging,
    animation: { enabled: false, profile: null },
    entity: null,
    announcement: null,
    brand: {
      enabled: true,
      text: 'MIRA\nTAPROOM',
      x: 1650,
      y: 120,
      font_family: 'inter',
      font_size: 58,
      vertical_scale: 1,
      line_spacing: -14,
      letter_spacing: 2,
      text_color: '#FFFFFF',
      glow_color: '#35D9FF',
      glow_strength: 12,
      entrance_effect: 'none',
      loop_effect: 'float',
      exit_effect: 'none',
      entrance_duration_ms: 900,
      exit_duration_ms: 550,
      letter_stagger_ms: 0,
      amplitude_px: 8,
      overshoot: 0,
      cycle_seconds: 5.5,
      effect: 'none'
    },
    environment: {
      enabled: true,
      effect: 'aquarium',
      parameters: { style: 'premium', intro_fill: false, intensity: 45, fish_count: 4, bubble_density: 12, plant_density: 8, caustics: 12, speed: 35 }
    },
    scene_playlist: { enabled: false, menu_duration_seconds: 40, scenes: [] },
    weather: null,
    fallback_poll_interval_ms: 60000,
    log_batch_size: 100,
    log_local_max_entries: 5000,
    log_local_max_bytes: 10 * MiB
  };
}

function weatherResponse() {
  return {
    settings: {
      enabled: true,
      location_name: 'Хельсинки',
      position: 'top-right',
      refresh_minutes: 15,
      width_px: 420,
      opacity: 0.96,
      show_condition: true,
      show_feels_like: true,
      show_humidity: true,
      show_wind: true,
      show_forecast: true,
      forecast_items: 3
    },
    snapshot: {
      location_name: 'Хельсинки',
      temperature: 18,
      apparent_temperature: 17,
      humidity: 64,
      wind_speed: 12,
      weather_code: 61,
      is_day: true,
      condition: 'Дождь',
      icon: 'rain',
      updated_at: new Date().toISOString(),
      forecast: [
        { time: '2026-09-07T14:00', temperature: 19, icon: 'rain', precipitation_probability: 70 },
        { time: '2026-09-07T16:00', temperature: 17, icon: 'cloud', precipitation_probability: 35 },
        { time: '2026-09-07T18:00', temperature: 15, icon: 'partly-cloudy', precipitation_probability: 20 }
      ]
    }
  };
}

function metricMap(result) {
  return Object.fromEntries(result.metrics.map(({ name, value }) => [name, value]));
}

async function animationSample(page, durationMs = 4000) {
  return page.evaluate((duration) => new Promise((resolve) => {
    const started = performance.now();
    let frames = 0;
    let previous = started;
    let maxGap = 0;
    const tick = (now) => {
      frames += 1;
      maxGap = Math.max(maxGap, now - previous);
      previous = now;
      if (now - started >= duration) {
        resolve({ durationMs: now - started, frames, fps: frames * 1000 / (now - started), maxFrameGapMs: maxGap });
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), durationMs);
}

test('TV Player renders a realistic animated screen within a measured runtime budget', async ({ browser }, testInfo) => {
  const browserContext = await browser.newContext({ baseURL, serviceWorkers: 'block', viewport: { width: 1920, height: 1080 } });
  await browserContext.addInitScript(() => {
    class StableWebSocket extends EventTarget {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      constructor() { super(); this.readyState = StableWebSocket.CONNECTING; setTimeout(() => { this.readyState = StableWebSocket.OPEN; this.dispatchEvent(new Event('open')); }, 20); }
      close() { this.readyState = StableWebSocket.CLOSED; this.dispatchEvent(new Event('close')); }
      send() {}
    }
    Object.defineProperty(window, 'WebSocket', { configurable: true, value: StableWebSocket });
  });

  const page = await browserContext.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  const snapshot = contextSnapshot();
  const weather = weatherResponse();
  let deltaRequests = 0;

  try {
    await page.route('**/api/device/session', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authorized: true, device_id: 77, device_key: 'runtime-audit-device-key-123456', session_expires_at: new Date(Date.now() + 86400000).toISOString(), screen: snapshot.screen })
    }));
    await page.route('**/api/device/player-logs', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accepted_through: 1000000 }) }));
    await page.route('**/api/device/player-delta', (route) => {
      deltaRequests += 1;
      const body = deltaRequests === 1
        ? { full_snapshot_required: true, context: snapshot }
        : { schema_version: 2, revision: snapshot.revision, hashes: snapshot.hashes, changed: {}, unchanged: true };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.route('**/api/device/weather', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(weather) }));

    const cdp = await browserContext.newCDPSession(page);
    await cdp.send('Performance.enable');
    await page.goto('/player', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-tv-player]')).not.toHaveClass(/is-hidden/);
    await expect(page.locator('[data-player-menu-layer] svg.menu-table-svg')).toHaveCount(1);
    const brandLocator = page.locator('[data-brand-layer] .scene-brand-title');
    await expect(brandLocator).toBeVisible();
    await expect(page.locator('[data-player-environment-layer] .aquarium-fish')).toHaveCount(4);
    await expect(page.locator('[data-weather-layer] .weather-widget')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const brandGeometry = await brandLocator.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        position: getComputedStyle(node).position,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2
      };
    });
    expect(brandGeometry.position).toBe('absolute');
    expect(Math.abs(brandGeometry.centerX - snapshot.brand.x)).toBeLessThan(2);
    expect(Math.abs(brandGeometry.centerY - snapshot.brand.y)).toBeLessThan(2);
    expect(brandGeometry.left).toBeGreaterThanOrEqual(0);
    expect(brandGeometry.top).toBeGreaterThanOrEqual(0);
    expect(brandGeometry.right).toBeLessThanOrEqual(1920);
    expect(brandGeometry.bottom).toBeLessThanOrEqual(1080);

    const weatherStyle = await page.locator('[data-weather-layer] .weather-widget').evaluate((node) => {
      const style = getComputedStyle(node);
      return { backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage, borderTopWidth: style.borderTopWidth, boxShadow: style.boxShadow };
    });
    expect(weatherStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(weatherStyle.backgroundImage).toBe('none');
    expect(weatherStyle.borderTopWidth).toBe('0px');
    expect(weatherStyle.boxShadow).toBe('none');

    const before = metricMap(await cdp.send('Performance.getMetrics'));
    const animation = await animationSample(page, 4000);
    const after = metricMap(await cdp.send('Performance.getMetrics'));
    const resources = await page.evaluate(() => {
      const rows = performance.getEntriesByType('resource').map((entry) => ({
        name: new URL(entry.name).pathname,
        initiatorType: entry.initiatorType,
        transferSize: entry.transferSize || 0,
        encodedBodySize: entry.encodedBodySize || 0,
        decodedBodySize: entry.decodedBodySize || 0
      }));
      return {
        count: rows.length,
        transferBytes: rows.reduce((sum, row) => sum + row.transferSize, 0),
        encodedBytes: rows.reduce((sum, row) => sum + row.encodedBodySize, 0),
        decodedBytes: rows.reduce((sum, row) => sum + row.decodedBodySize, 0),
        fontBytes: rows.filter((row) => row.name.startsWith('/fonts/')).reduce((sum, row) => sum + row.encodedBodySize, 0),
        rows
      };
    });

    const elapsedSeconds = animation.durationMs / 1000;
    const headlessRafFps = Number(animation.fps.toFixed(1));
    const audit = {
      viewport: '1920x1080',
      jsHeapUsedMiB: Number(((after.JSHeapUsedSize || 0) / MiB).toFixed(2)),
      jsHeapTotalMiB: Number(((after.JSHeapTotalSize || 0) / MiB).toFixed(2)),
      domNodes: Math.round(after.Nodes || 0),
      documents: Math.round(after.Documents || 0),
      eventListeners: Math.round(after.JSEventListeners || 0),
      mainThreadUtilizationPercent: Number((((after.TaskDuration || 0) - (before.TaskDuration || 0)) / elapsedSeconds * 100).toFixed(1)),
      scriptCpuPercent: Number((((after.ScriptDuration || 0) - (before.ScriptDuration || 0)) / elapsedSeconds * 100).toFixed(1)),
      layoutCpuPercent: Number((((after.LayoutDuration || 0) - (before.LayoutDuration || 0)) / elapsedSeconds * 100).toFixed(1)),
      recalcStyleCpuPercent: Number((((after.RecalcStyleDuration || 0) - (before.RecalcStyleDuration || 0)) / elapsedSeconds * 100).toFixed(1)),
      headlessRafFps,
      headlessRafThrottled: headlessRafFps < 15,
      maxHeadlessRafGapMs: Number(animation.maxFrameGapMs.toFixed(1)),
      resourceRequests: resources.count,
      transferMiB: Number((resources.transferBytes / MiB).toFixed(2)),
      encodedMiB: Number((resources.encodedBytes / MiB).toFixed(2)),
      decodedMiB: Number((resources.decodedBytes / MiB).toFixed(2)),
      fontMiB: Number((resources.fontBytes / MiB).toFixed(2)),
      errors
    };

    console.log(`MIRA_PLAYER_RESOURCE_AUDIT ${JSON.stringify(audit)}`);
    await testInfo.attach('tv-player-runtime-1920x1080', { body: await page.screenshot({ type: 'png' }), contentType: 'image/png' });
    await testInfo.attach('tv-player-runtime-metrics', { body: Buffer.from(JSON.stringify({ audit, brandGeometry, resources: resources.rows }, null, 2)), contentType: 'application/json' });

    expect(errors).toEqual([]);
    expect(audit.domNodes).toBeLessThan(2200);
    expect(audit.jsHeapUsedMiB).toBeLessThan(16);
    expect(audit.mainThreadUtilizationPercent).toBeLessThan(15);
    expect(audit.encodedMiB).toBeLessThan(4);
    expect(audit.resourceRequests).toBeLessThan(80);
  } finally {
    await browserContext.close();
  }
});
