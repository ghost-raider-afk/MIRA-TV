import { test, expect } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';

function textElement(value, x = 960) {
  return {
    id: 'parity-text',
    type: 'text',
    enabled: true,
    x, y: 80, width: 720, height: 180,
    z_index: 5, opacity: 1, rotation_deg: 0,
    text: {
      runs: [{ value, font_family:'system-sans', font_size_px:72, font_weight:800, color:'#FFFFFF' }],
      paragraph: { align:'center', vertical_align:'center', wrap:true },
      effects: { fill:{ enabled:true, mode:'solid', color:'#FFFFFF', opacity:1 } }
    }
  };
}

function weatherElement() {
  return {
    id: 'parity-weather',
    type: 'weather',
    enabled: true,
    x: 80, y: 80, width: 520, height: 360,
    z_index: 6, opacity: 1, rotation_deg: 0,
    weather: {
      mode:'current-and-forecast',
      location_name:'Берлин',
      latitude:52.52,
      longitude:13.405,
      timezone:'Europe/Berlin',
      refresh_minutes:15,
      show_location:true,
      show_condition:true,
      show_feels_like:true,
      show_humidity:true,
      show_wind:true,
      show_forecast:true,
      forecast_items:3,
      animation_enabled:false,
      animation_speed:1,
      animation_intensity:1,
      widget_motion_enabled:false
    }
  };
}

function playerContext(version, { withWeather = false } = {}) {
  const second = version > 1;
  const elements = [textElement(second ? 'НОВЫЙ ТЕКСТ' : 'ПЕРВЫЙ ТЕКСТ', second ? 1040 : 960)];
  if (withWeather) elements.push(weatherElement());
  const hashes = Object.fromEntries(['screen','menu','scene','animation','scene_playlist','runtime']
    .map((name) => [name, `${name}-scene-parity-${version}-01234567890123456789`]));
  return {
    schema_version: 4,
    revision: `4:${version}`,
    render_revision: version,
    hashes,
    screen: { id:1, name:'ТВ 1', resolution:'1920x1080', location_id:1, location_name:'Точка 1', location_number:1 },
    draft: { rows:[], settings:{ background_color:'#123456' }, revision:1 },
    products: [],
    packaging: [],
    scene: { version:1, elements },
    animation: { enabled:false, profile:null },
    scene_playlist: { enabled:false, animation_enabled:true, menu_duration_seconds:40, scenes:[] },
    app_version:'1.10.2',
    fallback_poll_interval_ms:60000,
    log_batch_size:100,
    log_local_max_entries:5000,
    log_local_max_bytes:10485760
  };
}

function installFakeSocket(context) {
  return context.addInitScript(() => {
    class FakeWebSocket extends EventTarget {
      static CONNECTING=0; static OPEN=1; static CLOSING=2; static CLOSED=3;
      constructor(url) {
        super(); this.url=url; this.readyState=FakeWebSocket.CONNECTING;
        window.__miraTestSockets ||= []; window.__miraTestSockets.push(this);
        setTimeout(() => { if (this.readyState===FakeWebSocket.CONNECTING) { this.readyState=FakeWebSocket.OPEN; this.dispatchEvent(new Event('open')); } }, 20);
      }
      close() { this.readyState=FakeWebSocket.CLOSED; this.dispatchEvent(new Event('close')); }
      send() {}
      emit(message) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) })); }
    }
    window.WebSocket=FakeWebSocket;
  });
}

test('TV Player updates keyed generic scene elements from WebSocket invalidation without rebuilding menu', async ({ browser }) => {
  const context=await browser.newContext({ baseURL, serviceWorkers:'block' });
  await installFakeSocket(context);
  const page=await context.newPage();
  let requests=0;
  const first=playerContext(1);
  const second=playerContext(2);

  try {
    await page.route('**/api/device/session', route=>route.fulfill({
      status:200, contentType:'application/json',
      body:JSON.stringify({ authorized:true, device_id:1, device_key:'scene-parity-device', session_expires_at:new Date(Date.now()+86400000).toISOString(), screen:first.screen })
    }));
    await page.route('**/api/device/player-logs', route=>route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ accepted_through:100000 }) }));
    await page.route('**/api/device/player-delta', route=>{
      requests+=1;
      if(requests===1) return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ full_snapshot_required:true, context:first }) });
      if(requests===2) return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ unchanged:true, schema_version:4, revision:first.revision, render_revision:1, hashes:first.hashes }) });
      return route.fulfill({
        status:200, contentType:'application/json',
        body:JSON.stringify({ schema_version:4, revision:second.revision, render_revision:2, hashes:second.hashes, changed:{ scene:second.scene, runtime:{ app_version:'1.10.2', fallback_poll_interval_ms:60000, log_batch_size:100, log_local_max_entries:5000, log_local_max_bytes:10485760, render_revision:2 } } })
      });
    });

    await page.goto('/player');
    const menu=page.locator('[data-player-menu-layer] svg.menu-table-svg');
    const node=page.locator('[data-scene-element-id="parity-text"]');
    await expect(node.locator('[data-scene-text] span')).toHaveText('ПЕРВЫЙ ТЕКСТ');
    await expect(menu).toHaveCount(1);
    await menu.evaluate(n=>{n.dataset.identityProbe='stable-menu';});
    await node.evaluate(n=>{n.dataset.identityProbe='stable-scene';});

    await expect.poll(()=>requests).toBeGreaterThanOrEqual(2);
    await page.evaluate(()=>window.__miraTestSockets?.[0]?.emit({ type:'context.changed', revision:'4:2' }));
    await expect.poll(()=>requests).toBeGreaterThanOrEqual(3);

    await expect(node.locator('[data-scene-text] span')).toHaveText('НОВЫЙ ТЕКСТ');
    await expect(page.locator('[data-scene-element-id="parity-text"][data-identity-probe="stable-scene"]')).toHaveCount(1);
    await expect(page.locator('[data-player-menu-layer] svg.menu-table-svg[data-identity-probe="stable-menu"]')).toHaveCount(1);
    expect(Number.parseFloat(await node.evaluate(n=>n.style.left))).toBeCloseTo(1040/1920*100, 3);
  } finally {
    await context.close();
  }
});

test('TV Player renders weather inside the canonical generic scene layer', async ({ browser }) => {
  const context=await browser.newContext({ baseURL, serviceWorkers:'block' });
  await installFakeSocket(context);
  const page=await context.newPage();
  const state=playerContext(1,{withWeather:true});
  const snapshot={
    location_name:'Берлин', temperature:18, apparent_temperature:17, humidity:61, wind_speed:9,
    weather_code:2, is_day:true, condition:'Переменная облачность', icon:'partly-cloudy',
    updated_at:new Date().toISOString(), forecast:[]
  };
  let deltaRequests=0;

  try {
    await page.route('**/api/device/session', route=>route.fulfill({
      status:200, contentType:'application/json',
      body:JSON.stringify({ authorized:true, device_id:1, device_key:'weather-parity-device', session_expires_at:new Date(Date.now()+86400000).toISOString(), screen:state.screen })
    }));
    await page.route('**/api/device/player-logs', route=>route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ accepted_through:100000 }) }));
    await page.route('**/api/device/player-delta', route=>{
      deltaRequests+=1;
      const body=deltaRequests===1
        ? { full_snapshot_required:true, context:state }
        : { unchanged:true, schema_version:4, revision:state.revision, render_revision:1, hashes:state.hashes };
      return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(body) });
    });
    await page.route('**/api/device/weather', route=>route.fulfill({
      status:200, contentType:'application/json',
      body:JSON.stringify({ settings:weatherElement().weather, snapshot })
    }));

    await page.goto('/player');
    const weatherNode=page.locator('[data-scene-element-id="parity-weather"]');
    await expect(weatherNode.locator('[data-scene-weather-mount] .weather-widget')).toBeVisible({ timeout:5000 });
    await expect(weatherNode.locator('.weather-widget-location')).toHaveText('Берлин');
    await expect(weatherNode.locator('[data-scene-weather-mount]')).toHaveAttribute('data-weather-animation','off');

    const order=await page.locator('[data-player-stage]').evaluate(stage=>[...stage.children].map(node=>node instanceof HTMLElement ? node.dataset.sceneLayer||'' : ''));
    expect(order).toEqual(expect.arrayContaining(['menu','fx','content','scene']));
    expect(order.indexOf('scene')).toBeGreaterThan(order.indexOf('content'));
    await expect(page.locator('[data-player-environment-layer],[data-brand-layer],[data-weather-layer]')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
