import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { completeWeatherWidget, weatherWidgetInput } from '../src/contracts/weather.js';
import { normaliseWeatherWidget } from '../src/web/admin-ui/public/js/motion/weather-widget.js';
import { getWeatherSnapshot, hasWeatherCoordinates } from '../src/services/weather-service.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('weather widget stores canonical transform and motion controls', () => {
  const value = weatherWidgetInput({
    enabled: false,
    position: 'top-right',
    x: 777,
    y: 333,
    scale: 1.75,
    width_px: 520,
    animation_enabled: false,
    animation_speed: 1.6,
    animation_intensity: 1.4,
    widget_motion_enabled: false
  });
  assert.equal(value.x, 777);
  assert.equal(value.y, 333);
  assert.equal(value.scale, 1.75);
  assert.equal(value.width_px, 520);
  assert.equal(value.animation_enabled, false);
  assert.equal(value.animation_speed, 1.6);
  assert.equal(value.animation_intensity, 1.4);
  assert.equal(value.widget_motion_enabled, false);
});

test('weather geometry is isolated from menu and promotion rerenders', async () => {
  const [scenePage, playerRenderer, elementRenderer, weatherWidget, weatherCss] = await Promise.all([
    read('src/web/admin-ui/public/js/pages/scene.js'),
    read('src/web/admin-ui/public/js/player/player-scene-renderer.js'),
    read('src/web/admin-ui/public/js/player/scene-element-renderer.js'),
    read('src/web/admin-ui/public/js/motion/weather-widget.js'),
    read('src/web/admin-ui/public/css/weather-widget.css')
  ]);
  assert.match(scenePage, /renderer\.render\(sceneContext\(\), \['menu'\]\)/);
  assert.doesNotMatch(scenePage, /renderer\.render\(sceneContext\(\), \['screen', 'menu'\]\)/);
  assert.match(playerRenderer, /if \(dirty\.has\('scene'\) \|\| dirty\.has\('screen'\)\)/);
  assert.doesNotMatch(playerRenderer, /dirty\.has\('scene'\) \|\| dirty\.has\('screen'\) \|\| menuDirty/);
  assert.match(elementRenderer, /function responsiveContent\(element\)/);
  assert.match(elementRenderer, /\['weather', 'image', 'video', 'logo'\]\.includes/);
  assert.match(elementRenderer, /content\.dataset\.sceneContentScale = '1'/);
  assert.match(weatherWidget, /summary\.append\(icon, primary\)/);
  assert.match(weatherWidget, /top\.append\(summary, visual\)/);
  assert.match(weatherCss, /\.weather-widget-summary\s*\{[\s\S]*grid-template-columns:\s*85px minmax\(0,1fr\)/);
  assert.match(weatherCss, /\.weather-widget-icon\s*\{[\s\S]*transform:\s*none/);
  assert.match(weatherCss, /data-weather-embedded="true"[\s\S]*container-type:size/);
  assert.match(weatherCss, /--weather-temperature-cqw/);
  assert.match(weatherCss, /--weather-location-cqw/);
});

test('weather coordinates preserve provider precision without artificial step rounding', async () => {
  const [elements] = await Promise.all([
    read('src/web/admin-ui/public/js/editor/elements.js')
  ]);
  const input = weatherWidgetInput({
    enabled:true,
    latitude:60.451753,
    longitude:22.266643,
    timezone:'Europe/Helsinki'
  });
  assert.equal(input.latitude, 60.451753);
  assert.equal(input.longitude, 22.266643);
  assert.match(elements, /latitude = input\('number',[\s\S]*step: 'any'/);
  assert.match(elements, /longitude = input\('number',[\s\S]*step: 'any'/);
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
  globalThis.fetch = async () => new Response(JSON.stringify({
    timezone:'Asia/Vladivostok',
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
  try {
    const snapshot = await getWeatherSnapshot({
      location_name:'Комсомольск-на-Амуре',
      latitude:50.55,
      longitude:137.01,
      timezone:'Asia/Vladivostok'
    }, {
      weatherProviderBaseUrl:'https://weather.invalid',
      weatherFetchTimeoutMs:1000,
      weatherCacheSeconds:600
    }, { force:true });
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

test('legacy weather settings keep animation enabled with safe defaults', () => {
  assert.deepEqual(
    (({ x, y }) => ({ x, y }))(completeWeatherWidget({ position: 'bottom-left' })),
    { x: 260, y: 890 }
  );
  const bounded = completeWeatherWidget({ x: -100, y: 5000, scale: 10, animation_speed: 5, animation_intensity: 0 });
  assert.equal(bounded.x, 1660);
  assert.equal(bounded.y, 190);
  assert.equal(bounded.scale, 1);
  assert.equal(bounded.animation_enabled, true);
  assert.equal(bounded.animation_speed, 1);
  assert.equal(bounded.animation_intensity, 1);
  assert.equal(bounded.widget_motion_enabled, true);
});

test('generic weather element controls atmosphere motion inside monitor scene', async () => {
  const [elements, widget, css, preview] = await Promise.all([
    read('src/web/admin-ui/public/js/editor/elements.js'),
    read('src/web/admin-ui/public/js/motion/weather-widget.js'),
    read('src/web/admin-ui/public/css/weather-widget.css'),
    read('src/web/admin-ui/public/js/editor/preview.js')
  ]);

  for (const field of ['animation_enabled','animation_speed','animation_intensity','widget_motion_enabled','temperature_font_family','temperature_size_percent','location_size_percent']) {
    assert.ok(elements.includes(field), field);
  }
  assert.doesNotMatch(elements, /weather-target-list|weather-apply|weatherStudioSettings/);
  assert.match(widget, /animation_enabled/);
  assert.match(widget, /animation_speed/);
  assert.match(widget, /animation_intensity/);
  assert.match(widget, /widget_motion_enabled/);
  assert.match(widget, /if \(!config\.animation_enabled\) return atmosphere/);
  assert.match(widget, /layer\.dataset\.weatherAnimation/);
  assert.match(widget, /--weather-atmosphere-opacity/);
  assert.match(widget, /visual\.append\(createAtmosphere\(state, config\)\)/);
  assert.match(widget, /layer\.append\(widget\)/);
  assert.doesNotMatch(widget, /layer\.append\(atmosphere, widget\)/);
  assert.match(widget, /export const WEATHER_SCENE_WIDTH = 1920/);
  assert.match(widget, /export const WEATHER_SCENE_HEIGHT = 1080/);
  assert.match(widget, /timeLabel\(item\.time, data\.timezone \|\| config\.timezone\)/);
  assert.match(widget, /particleGroup\('weather-sun', 1\)/);
  assert.match(widget, /particleGroup\('weather-moon', 1\)/);
  assert.doesNotMatch(widget, /weather-sun-rays/);
  assert.doesNotMatch(css, /weather-rays-rotate/);
  assert.match(css, /\.weather-widget-facts\s*\{[\s\S]*font-size:\s*15px/);
  assert.match(css, /\.weather-widget-forecast-item > span\s*\{[\s\S]*font-size:\s*14px/);
  assert.match(css, /\.weather-widget-main\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,58%\) minmax\(0,42%\)/);
  assert.match(css, /\.weather-widget-visual\s*\{[\s\S]*overflow:\s*hidden/);
  assert.match(css, /\.weather-widget-visual \.weather-atmosphere/);
  assert.match(css, /weather-atmosphere/);
  assert.doesNotMatch(preview, /SceneElementRenderer|weatherPreview|data-scene-elements-layer/);
});
test('Playlist apply changes only Scene Playlist; weather and motion profile stay owned elsewhere', async () => {
  const [playlist, settingsRoutes] = await Promise.all([
    read('src/web/admin-ui/public/js/pages/playlist.js'),
    read('src/api/settings/routes.js')
  ]);

  assert.match(playlist, /animationSettings\}\/playlist\/apply/);
  assert.match(playlist, /screen_ids:\s*ids/);
  assert.doesNotMatch(playlist, /readMotionProfile|bindMotionProfileControls|weatherStudioSettings|weatherSnapshot/);

  const applyStart = settingsRoutes.indexOf("router.put('/animation/playlist/apply'");
  const applyEnd = settingsRoutes.indexOf("router.put('/animation/apply'", applyStart);
  const applyRoute = settingsRoutes.slice(applyStart, applyEnd);
  assert.ok(applyStart >= 0 && applyEnd > applyStart);
  assert.match(applyRoute, /applyAnimationSettingsToScreens/);
  assert.doesNotMatch(applyRoute, /applyWeatherSettingsToScreens|weatherWidgetInput|getWeatherSettings/);
  assert.match(applyRoute, /\['scene_playlist'\]/);
  assert.doesNotMatch(applyRoute, /\['animation', 'scene_playlist'\]/);
  assert.match(applyRoute, /markScreenRenderChanged/);
  assert.match(applyRoute, /applied_screens/);
  assert.doesNotMatch(settingsRoutes, /animation\/entity-asset|replaceEntityAssetStream/);
});

test('offline weather restores through canonical Player LKG and keeps cache isolated by monitor', async () => {
  const [stateSync, weatherRuntime] = await Promise.all([
    read('src/web/admin-ui/public/js/player/player-state-sync.js'),
    read('src/web/admin-ui/public/js/player/weather-bootstrap.js')
  ]);

  assert.match(stateSync, /loadLastKnownGood/);
  assert.match(stateSync, /'screen', 'menu', 'scene', 'animation', 'scene_playlist', 'runtime'/);
  assert.doesNotMatch(stateSync, /'entity', 'weather', 'brand', 'announcement'/);
  assert.match(stateSync, /await applyContext\(record\.context, \[\.\.\.ALL_COMPONENTS\]/);

  assert.match(weatherRuntime, /const CACHE_PREFIX = 'mira-tv\.weather\.last\.v2\.'/);
  assert.match(weatherRuntime, /this\.screenId \? `\$\{CACHE_PREFIX\}\$\{this\.screenId\}` : ''/);
  assert.match(weatherRuntime, /settings:\s*\{ \.\.\.this\.settings, screen_id: this\.screenId \}/);
  assert.match(weatherRuntime, /legacyScreenId === this\.screenId/);
  assert.match(weatherRuntime, /applyContext\(settings, screenId/);
  assert.doesNotMatch(weatherRuntime, /loadLastKnownGood/);
  assert.doesNotMatch(weatherRuntime, /localStorage\.setItem\(LEGACY_CACHE_KEY/);
});

test('Player shell changes rotate only the offline shell cache and preserve downloaded media data', async () => {
  const worker = await read('src/web/admin-ui/public/player-sw.js');
  assert.match(worker, /const SHELL_CACHE = 'mira-tv-player-shell-v32'/);
  assert.match(worker, /const DATA_CACHE = 'mira-tv-player-data-v18'/);
  assert.match(worker, /const RETIRED_SHELL_CACHE = 'mira-tv-player-shell-v30'/);
  assert.match(worker, /const LEGACY_SHELL_CACHE = 'mira-tv-player-shell-v31'/);
  assert.match(worker, /caches\.delete\(LEGACY_SHELL_CACHE\)/);
});


test('Scene weather preview invalidates stale source data and uses protected preview endpoint', async () => {
  const [runtime, renderer] = await Promise.all([
    read('src/web/admin-ui/public/js/player/weather-bootstrap.js'),
    read('src/web/admin-ui/public/js/player/player-scene-renderer.js')
  ]);
  assert.match(runtime, /function weatherSourceKey\(settings\)/);
  assert.match(runtime, /sourceChanged = nextSourceKey !== this\.sourceKey/);
  assert.match(runtime, /hasWeatherCoordinates\(this\.settings\)/);
  assert.match(runtime, /url\.searchParams\.set\('latitude'/);
  assert.match(runtime, /url\.searchParams\.set\('longitude'/);
  assert.match(runtime, /if \(this\.preview\)/);
  assert.match(renderer, /weatherPreviewEndpoint = '\/api\/weather\/preview'/);
});
