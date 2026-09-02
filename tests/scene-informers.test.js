import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { scenePayloadInput } from '../src/contracts/scene.js';
import { buildPlayerState } from '../src/services/player-context-service.js';
import { createWeatherService } from '../src/services/weather-service.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

function sceneWithWeather(location = 'Helsinki') {
  return {
    schema_version: 1,
    name: 'Погода',
    display_count: 1,
    active_slide_id: 'slide-1',
    slides: [{
      id: 'slide-1',
      name: 'Слайд 1',
      duration_ms: 10000,
      transition: 'fade',
      background: { type: 'color', color: '#10141c', asset_id: '' },
      elements: [{
        id: 'element-weather',
        type: 'weather',
        x: 100,
        y: 100,
        width: 480,
        height: 230,
        z_index: 1,
        opacity: 1,
        content: 'Погода',
        variant: 'compact',
        weather: { location },
        style: { color: '#ffffff', font_size: 42, background: 'transparent', radius: 20 },
        effects: { shadow: false, glow: false, blur: 0 },
        animation: { entrance: 'none', loop: 'none', exit: 'none', duration_ms: 600 }
      }]
    }]
  };
}

function playerConfig() {
  return {
    playerFallbackPollSeconds: 60,
    playerLogBatchSize: 100,
    playerLogLocalMaxEntries: 5000,
    playerLogLocalMaxBytes: 10 * 1024 * 1024,
    weatherPlayerRefreshSeconds: 900,
    weatherGeocodingUrl: 'https://weather.example/geocode',
    weatherForecastUrl: 'https://weather.example/forecast',
    weatherCacheSeconds: 900,
    weatherRequestTimeoutMs: 5000,
    weatherCacheMaxEntries: 64
  };
}

test('Scene contract persists weather location as first-class element configuration', () => {
  const scene = scenePayloadInput(sceneWithWeather('  Helsinki   Keskusta  '));
  const weather = scene.slides[0].elements[0];
  assert.deepEqual(weather.weather, { location: 'Helsinki Keskusta' });
  assert.equal(weather.content, 'Погода');
});

test('production weather service is shared per config while injected test services stay isolated', () => {
  const config = playerConfig();
  assert.equal(createWeatherService(config), createWeatherService(config));
  const fakeFetch = async () => ({ ok: true, async json() { return {}; } });
  assert.notEqual(createWeatherService(config, { fetchImpl: fakeFetch }), createWeatherService(config, { fetchImpl: fakeFetch }));
});

test('Player state resolves weather through MIRA-TV and exposes refresh interval', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    calls.push(parsed.pathname);
    if (parsed.pathname === '/geocode') {
      return { ok: true, async json() { return { results: [{ name: 'Хельсинки', country: 'Финляндия', latitude: 60.17, longitude: 24.94 }] }; } };
    }
    return {
      ok: true,
      async json() {
        return {
          current: { temperature_2m: 12.4, weather_code: 2 },
          daily: {
            time: ['2026-09-02', '2026-09-03'],
            weather_code: [2, 61],
            temperature_2m_max: [14, 12],
            temperature_2m_min: [8, 7]
          }
        };
      }
    };
  };

  const revisionScene = scenePayloadInput(sceneWithWeather('Helsinki'));
  const store = {
    async getScreenSceneAssignment() { return { scene_revision_id: 'revision-1' }; },
    async getSceneRevision() { return { id: 'revision-1', scene_id: 'scene-1', scene_name: 'Погода', revision_number: 1, published_at: '2026-09-02T00:00:00Z', scene: revisionScene }; },
    async listProducts() { return []; },
    async listMediaAssetsByIds() { return []; },
    async getScreen() { return { id: 1, name: 'TV 1', resolution: '1920x1080', status: 'online', active: true, location_id: 1, location_name: 'Точка', location_number: 1 }; },
    async getScreenDraft() { return { rows: [], settings: {}, revision: 1 }; },
    async getScreenAnimationSettings() { return null; },
    async listProductsByIds() { return []; },
    async listPackagingByIds() { return []; }
  };

  try {
    const state = await buildPlayerState(store, { screen_id: 1 }, playerConfig());
    assert.deepEqual(calls, ['/geocode', '/forecast']);
    assert.equal(state.components.scene.weather_by_element['element-weather'].location, 'Хельсинки');
    assert.equal(state.components.scene.weather_by_element['element-weather'].current.temperature_c, 12);
    assert.equal(state.components.runtime.weather_refresh_interval_ms, 900000);
    assert.equal('fetched_at' in state.components.scene.weather_by_element['element-weather'], false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Informer UI and shared playback refresh clocks without rebuilding the whole Scene', async () => {
  const [editor, html, renderer, runtime, playback, sync, worker] = await Promise.all([
    read('src/web/admin-ui/public/js/scenes/editor.js'),
    read('src/web/admin-ui/public/scene-editor.html'),
    read('src/web/admin-ui/public/js/scene-runtime/renderer.js'),
    read('src/web/admin-ui/public/js/player/published-scene-runtime.js'),
    read('src/web/admin-ui/public/js/scene-runtime/playback.js'),
    read('src/web/admin-ui/public/js/player/player-state-sync.js'),
    read('src/web/admin-ui/public/player-sw.js')
  ]);

  assert.match(html, /id="weather-location"/);
  assert.match(html, /id="weather-refresh"/);
  assert.match(editor, /API\.weather/);
  assert.match(editor, /weatherByElement/);
  assert.match(editor, /\['seconds', 'analog'\]/);
  assert.match(editor, /updateSceneClockElements/);
  assert.match(renderer, /variant === 'analog'/);
  assert.match(renderer, /variant === 'forecast'/);
  assert.match(runtime, /weatherByElement: component\?\.weather_by_element \|\| \{\}/);
  assert.match(playback, /updateSceneClockElements/);
  assert.match(playback, /syncClockTimer\(\)/);
  assert.match(sync, /weather_refresh_interval_ms/);
  assert.match(sync, /syncNow\('weather-refresh'\)/);
  assert.match(sync, /clearWeatherTimer\(\)/);
  assert.match(worker, /mira-tv-player-shell-v16-scene8/);
});
