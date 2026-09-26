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
  const hashes = Object.fromEntries(['screen','menu','scene','animation','scene_playlist','runtime'].map((name) => [name, `${name}-runtime-audit-012345678901234567890123456789`]));
  return {
    schema_version: 4,
    revision: '4:1',
    render_revision: 1,
    hashes,
    screen: { id: 77, name: 'TV Runtime Audit', resolution: '1920x1080', status: 'active', location_id: 7, location_name: 'Тестовая точка', location_number: 1 },
    draft: {
      revision: 1,
      settings: {
        background_color: '#101828', accent_color: '#F4C915', text_color: '#F8FAFC',
        font_family: 'arial-narrow', font_scale_percent: 100,
        table_x: 56, table_y: 15, table_width_px: 1374, table_height_px: 925
      },
      rows
    },
    products,
    packaging,
    scene: {
      version: 1,
      elements: [
        {
          id:'runtime-title', type:'text', enabled:true,
          x:1480, y:60, width:340, height:150, z_index:5, opacity:1, rotation_deg:0,
          text:{
            runs:[{value:'MIRA TAPROOM',font_family:'system-sans',font_size_px:58,font_weight:800,color:'#FFFFFF'}],
            paragraph:{align:'center',vertical_align:'center',wrap:true},
            effects:{fill:{enabled:true,mode:'solid',color:'#FFFFFF',opacity:1},glow:{enabled:true,blur_px:12,spread_px:0,color:'#35D9FF',opacity:.65}}
          }
        },
        {
          id:'runtime-weather', type:'weather', enabled:true,
          x:80, y:80, width:420, height:340, z_index:6, opacity:.96, rotation_deg:0,
          weather:{
            mode:'current-and-forecast',location_name:'Хельсинки',latitude:60.1699,longitude:24.9384,timezone:'Europe/Helsinki',
            refresh_minutes:15,show_location:true,show_condition:true,show_feels_like:true,show_humidity:true,show_wind:true,
            show_forecast:true,forecast_items:3,animation_enabled:true,animation_speed:1,animation_intensity:1,widget_motion_enabled:true
          }
        }
      ]
    },
    animation: { enabled: false, profile: null },
    scene_playlist: { enabled: false, animation_enabled:true, menu_duration_seconds: 40, scenes: [] },
    app_version:'1.10.2',
    fallback_poll_interval_ms:60000,
    log_batch_size:100,
    log_local_max_entries:5000,
    log_local_max_bytes:10 * MiB
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
    await page.route('**/api/device/cache-status', (route) => route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ accepted: true }) }));
    await page.route('**/api/device/player-delta', (route) => {
      deltaRequests += 1;
      const body = deltaRequests === 1
        ? { full_snapshot_required: true, context: snapshot }
        : { schema_version: 4, revision: snapshot.revision, hashes: snapshot.hashes, changed: {}, unchanged: true };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.route('**/api/device/weather', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(weather) }));

    const cdp = await browserContext.newCDPSession(page);
    await cdp.send('Performance.enable');
    await page.goto('/player', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-tv-player]')).not.toHaveClass(/is-hidden/);
    await expect(page.locator('[data-player-menu-layer] svg.menu-table-svg')).toHaveCount(1);
    const titleLocator = page.locator('[data-scene-element-id="runtime-title"]');
    await expect(titleLocator.locator('[data-scene-text] span')).toHaveText('MIRA TAPROOM');
    const weatherLocator = page.locator('[data-scene-element-id="runtime-weather"]');
    await expect(weatherLocator.locator('.weather-widget')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const elementGeometry = await titleLocator.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        position: getComputedStyle(node).position,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom
      };
    });
    expect(elementGeometry.position).toBe('absolute');
    expect(elementGeometry.left).toBeGreaterThanOrEqual(0);
    expect(elementGeometry.top).toBeGreaterThanOrEqual(0);
    expect(elementGeometry.right).toBeLessThanOrEqual(1920);
    expect(elementGeometry.bottom).toBeLessThanOrEqual(1080);

    const weatherStyle = await weatherLocator.locator('.weather-widget').evaluate((node) => {
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
    await testInfo.attach('tv-player-runtime-metrics', { body: Buffer.from(JSON.stringify({ audit, elementGeometry, resources: resources.rows }, null, 2)), contentType: 'application/json' });

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
