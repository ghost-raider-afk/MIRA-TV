import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { completeWeatherWidget, weatherWidgetInput } from '../src/contracts/weather.js';
import { normaliseWeatherWidget } from '../src/web/admin-ui/public/js/player/weather-widget.js';
import { hasWeatherCoordinates } from '../src/services/weather-service.js';
import { fetchOpenMeteo } from '../src/services/weather/providers/open-meteo.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('weather widget stores only static visual settings', () => {
  const value = weatherWidgetInput({
    enabled:true,
    location_name:'Комсомольск-на-Амуре',
    latitude:50.55,
    longitude:137.01,
    timezone:'Asia/Vladivostok',
    x:777,
    y:333,
    scale:1.75,
    width_px:520,
    temperature_font_size_pt:72,
    location_font_size_pt:20,
    icon_scale_percent:175
  });

  assert.equal(value.x, 777);
  assert.equal(value.y, 333);
  assert.equal(value.scale, 1.75);
  assert.equal(value.width_px, 520);
  assert.equal(value.temperature_font_size_pt, 72);
  assert.equal(value.location_font_size_pt, 20);
  assert.equal(value.icon_scale_percent, 175);
  for (const key of ['animation_enabled','animation_speed','animation_intensity','widget_motion_enabled']) {
    assert.equal(Object.hasOwn(value, key), false, key);
  }
});

test('weather renderer is static while data stays live', async () => {
  const [elements, widget, css, runtime] = await Promise.all([
    read('src/web/admin-ui/public/js/editor/elements.js'),
    read('src/web/admin-ui/public/js/player/weather-widget.js'),
    read('src/web/admin-ui/public/css/weather-widget.css'),
    read('src/web/admin-ui/public/js/player/weather-bootstrap.js')
  ]);

  assert.doesNotMatch(elements, /animation_enabled|animation_speed|animation_intensity|widget_motion_enabled|Анимация/);
  assert.doesNotMatch(widget, /createAtmosphere|particleGroup|animation_enabled|animation_speed|widget_motion_enabled/);
  assert.match(widget, /weather-widget-visual-static/);
  assert.match(widget, /visual\.innerHTML = svgIcon/);

  assert.doesNotMatch(css, /@keyframes|animation\s*:|transition\s*:|will-change/);
  assert.doesNotMatch(css, /weather-atmosphere|weather-particle/);

  assert.match(runtime, /weatherSourceKey/);
  assert.match(runtime, /PREVIEW_RETRY_MS/);
  assert.doesNotMatch(runtime, /navigator\.onLine/);
});

test('weather typography keeps point sizes and static icon scaling', () => {
  const configured = normaliseWeatherWidget({
    enabled:true,
    temperature_font_family:'mira-mono',
    temperature_font_size_pt:72,
    location_font_size_pt:20,
    icon_scale_percent:175
  });
  assert.equal(configured.temperature_font_family, 'mira-mono');
  assert.equal(configured.temperature_font_size_pt, 72);
  assert.equal(configured.location_font_size_pt, 20);
  assert.equal(configured.icon_scale_percent, 175);
});

test('browser and server weather models preserve empty coordinates as unconfigured', () => {
  const value = normaliseWeatherWidget({ enabled:true, latitude:null, longitude:'' });
  assert.equal(value.latitude, null);
  assert.equal(value.longitude, null);
  assert.equal(hasWeatherCoordinates({ latitude:null, longitude:null }), false);
  assert.equal(hasWeatherCoordinates({ latitude:'', longitude:'' }), false);
  assert.equal(hasWeatherCoordinates({ latitude:0, longitude:0 }), true);
});

test('weather forecast filtering follows provider city wall clock instead of server timezone', async () => {
  const originalFetch = globalThis.fetch;
  let requestedTimezone = '';
  globalThis.fetch = async (input) => {
    requestedTimezone = new URL(String(input)).searchParams.get('timezone') || '';
    return new Response(JSON.stringify({
      timezone:'UTC',
      current:{
        time:'2026-09-20T22:10',
        temperature_2m:9,
        apparent_temperature:7,
        relative_humidity_2m:70,
        weather_code:3,
        wind_speed_10m:11,
        is_day:0
      },
      hourly:{
        time:['2026-09-20T22:00','2026-09-20T23:00','2026-09-21T00:00','2026-09-21T01:00'],
        temperature_2m:[9,8,7,6],
        weather_code:[3,3,3,3],
        precipitation_probability:[10,10,10,10]
      }
    }), { status:200, headers:{'content-type':'application/json'} });
  };

  try {
    const snapshot = await fetchOpenMeteo({
      location_name:'Комсомольск-на-Амуре',
      latitude:50.55,
      longitude:137.01,
      timezone:'Asia/Vladivostok'
    }, {
      weatherProviderBaseUrl:'https://weather.invalid',
      weatherFetchTimeoutMs:1000
    });
    assert.equal(requestedTimezone, 'Asia/Vladivostok');
    assert.equal(snapshot.timezone, 'Asia/Vladivostok');
    assert.deepEqual(snapshot.forecast.slice(0, 3).map((item) => item.time), [
      '2026-09-20T23:00',
      '2026-09-21T00:00',
      '2026-09-21T01:00'
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
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

  assert.match(worker, /const SHELL_CACHE = 'mira-tv-player-shell-v53'/);
  assert.match(worker, /const RETIRED_SHELL_CACHE = 'mira-tv-player-shell-v52'/);
  assert.match(worker, /\/js\/player\/weather-widget\.js/);
  assert.doesNotMatch(worker, /['"]\/js\/motion\//);
  assert.doesNotMatch(worker, /['"]\/js\/player\/scene-video-runtime\.js['"]/);
  assert.doesNotMatch(worker, /['"][^'"]+\.(?:mp4|webm)(?:\?[^'"]*)?['"]/i);
});
