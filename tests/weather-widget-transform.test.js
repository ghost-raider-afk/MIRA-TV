import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { completeWeatherWidget } from '../src/web/admin-ui/public/js/shared/weather-widget-config.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('weather widget renderer exports shared markup and style helpers', async () => {
  const source = await read('src/web/admin-ui/public/js/player/weather-widget.js');
  assert.match(source, /export function renderWeatherWidget/);
  assert.match(source, /export function weatherWidgetStyle/);
});

test('weather bootstrap only asks the server for live data', async () => {
  const source = await read('src/web/admin-ui/public/js/player/weather-bootstrap.js');
  assert.match(source, /\/api\/weather\/screens\//);
  assert.doesNotMatch(source, /open-meteo|met\.no|api\.open-meteo/);
});

test('weather widget transform keeps widget geometry local to the scene element', async () => {
  const source = await read('src/web/admin-ui/public/js/player/weather-widget.js');
  assert.match(source, /translate3d\(/);
  assert.match(source, /rotate\(/);
  assert.doesNotMatch(source, /filter:/);
});

test('weather condition normalizer keeps unknown values deterministic', async () => {
  const source = await read('src/web/admin-ui/public/js/player/weather-widget.js');
  assert.match(source, /return 'cloudy';/);
});

test('weather widget completion preserves canonical scale, opacity and clipping fields', () => {
  const widget = completeWeatherWidget({
    x:100,
    y:120,
    width:420,
    height:190,
    scale:1.25,
    rotation:-7,
    opacity:0.72,
    clip:true
  });
  assert.equal(widget.x, 100);
  assert.equal(widget.y, 120);
  assert.equal(widget.width, 420);
  assert.equal(widget.height, 190);
  assert.equal(widget.scale, 1.25);
  assert.equal(widget.rotation, -7);
  assert.equal(widget.opacity, 0.72);
  assert.equal(widget.clip, true);
});

test('weather bootstrap uses city timezone for hourly selection', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return {
      ok:true,
      json:async () => ({
        current:{ temperature_2m:10, weather_code:1 },
        hourly:{
          time:['2026-09-20T23:00','2026-09-21T00:00','2026-09-21T01:00'],
          temperature_2m:[8,7,6],
          weather_code:[2,2,3]
        }
      })
    };
  };
  try {
    const { WeatherBootstrap } = await import(`../src/web/admin-ui/public/js/player/weather-bootstrap.js?timezone-test=${Date.now()}`);
    const bootstrap = new WeatherBootstrap({
      screenId:1,
      timezone:'Asia/Vladivostok',
      refreshMs:60_000,
      onData:() => {}
    });
    const result = await bootstrap.load();
    assert.ok(requests.some((url) => url.includes('/api/weather/screens/1')));
    assert.deepEqual(result.hourly.map((entry) => entry.time), [
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

  assert.match(worker, /const SHELL_CACHE = 'mira-tv-player-shell-v\d+';/);
  assert.match(worker, /const RETIRED_SHELL_CACHE = 'mira-tv-player-shell-v\d+';/);
  assert.match(worker, /\/js\/player\/weather-widget\.js/);
  assert.doesNotMatch(worker, /['"]\/js\/motion\//);
  assert.doesNotMatch(worker, /['"]\/js\/player\/scene-video-runtime\.js['"]/);
  assert.doesNotMatch(worker, /['"][^'"]+\.(?:mp4|webm)(?:\?[^'"]*)?['"]/i);
});