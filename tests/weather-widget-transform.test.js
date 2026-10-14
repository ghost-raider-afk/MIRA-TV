import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { completeWeatherWidget } from '../src/contracts/weather-settings.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('weather widget stores only static visual settings', () => {
  const input = completeWeatherWidget({
    location_name:'Владивосток', latitude:43.1155, longitude:131.8855, timezone:'Asia/Vladivostok',
    refresh_minutes:15, show_condition:true, show_forecast:true, forecast_items:3,
    x:100, y:120, width:480, height:210, rotation_deg:0, opacity:1, z_index:20,
    scale_percent:100, clip_enabled:false, clip_radius_px:24,
    temperature_font_size_pt:48, location_font_size_pt:14, icon_scale_percent:100
  });
  assert.equal(input.location_name, 'Владивосток');
  assert.equal(input.temperature_font_size_pt, 48);
  assert.equal(input.location_font_size_pt, 14);
  assert.equal(input.icon_scale_percent, 100);
  for (const key of ['animation_enabled','animation_speed','animation_intensity','widget_motion_enabled']) {
    assert.equal(Object.hasOwn(input, key), false, key);
  }
});

test('weather renderer is static while data stays live', async () => {
  const [widget, bootstrap, service] = await Promise.all([
    read('src/web/admin-ui/public/js/player/weather-widget.js'),
    read('src/web/admin-ui/public/js/player/weather-bootstrap.js'),
    read('src/services/weather-service.js')
  ]);
  assert.doesNotMatch(widget, /requestAnimationFrame|setInterval|animation:/);
  assert.match(widget, /translate\(/);
  assert.match(widget, /rotate\(/);
  assert.match(widget, /scale\(/);
  assert.match(widget, /opacity/);
  assert.match(widget, /fontSize/);
  assert.match(bootstrap, /fetchWeatherSnapshot/);
  assert.match(service, /cache/);
});

test('weather typography keeps point sizes and static icon scaling', async () => {
  const [settings, renderer] = await Promise.all([
    read('src/contracts/weather-settings.js'),
    read('src/web/admin-ui/public/js/player/weather-widget.js')
  ]);
  assert.match(settings, /temperature_font_size_pt/);
  assert.match(settings, /location_font_size_pt/);
  assert.match(settings, /icon_scale_percent/);
  assert.match(renderer, /temperature_font_size_pt/);
  assert.match(renderer, /location_font_size_pt/);
  assert.match(renderer, /icon_scale_percent/);
});

test('browser and server weather models preserve empty coordinates as unconfigured', async () => {
  const [bootstrap, service] = await Promise.all([
    read('src/web/admin-ui/public/js/player/weather-bootstrap.js'),
    read('src/services/weather-service.js')
  ]);
  assert.match(bootstrap, /latitude === null/);
  assert.match(bootstrap, /longitude === null/);
  assert.match(service, /latitude === null/);
  assert.match(service, /longitude === null/);
});

test('weather forecast filtering follows provider city wall clock instead of server timezone', async () => {
  const source = await read('src/services/weather-service.js');
  assert.match(source, /Intl\.DateTimeFormat/);
  assert.match(source, /timeZone/);
  assert.match(source, /formatToParts/);
});

test('legacy weather position still maps to canonical geometry without restoring motion fields', () => {
  const legacy = completeWeatherWidget({ position:'bottom-left' });
  assert.deepEqual({ x:legacy.x, y:legacy.y }, { x:260, y:890 });
  for (const key of ['animation_enabled','animation_speed','animation_intensity','widget_motion_enabled']) {
    assert.equal(Object.hasOwn(legacy, key), false, key);
  }
});

test('offline Player shell keeps static weather and Local-first state without motion assets', async () => {
  const [stateSync, weatherRuntime, worker] = await Promise.all([
    read('src/web/admin-ui/public/js/player/player-state-sync.js'),
    read('src/web/admin-ui/public/js/player/weather-bootstrap.js'),
    read('src/web/admin-ui/public/player-sw.js')
  ]);

  assert.match(stateSync, /loadLastKnownGood/);
  assert.match(stateSync, /'screen', 'menu', 'scene', 'content_manifest', 'runtime'/);
  assert.match(stateSync, /await applyContext\(record\.context, \[\.\.\.ALL_COMPONENTS\]/);

  assert.match(weatherRuntime, /const CACHE_PREFIX = 'mira-tv\.weather\.last\.v2\.'/);
  assert.match(weatherRuntime, /legacyScreenId === this\.screenId/);

  assert.match(worker, /const SHELL_CACHE = 'mira-tv-player-shell-v62'/);
  assert.match(worker, /const RETIRED_SHELL_CACHE = 'mira-tv-player-shell-v61'/);
  assert.match(worker, /\/js\/player\/weather-widget\.js/);
  assert.doesNotMatch(worker, /['"]\/js\/motion\//);
  assert.doesNotMatch(worker, /['"]\/js\/player\/scene-video-runtime\.js['"]/);
  assert.doesNotMatch(worker, /['"][^'"]+\.(?:mp4|webm)(?:\?[^'"]*)?['"]/i);
});