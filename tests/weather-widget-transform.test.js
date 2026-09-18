import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { completeWeatherWidget, weatherWidgetInput } from '../src/contracts/weather.js';

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

test('weather editor controls atmosphere motion without separating monitor targeting', async () => {
  const [studio, widget, css, preview] = await Promise.all([
    read('src/web/admin-ui/public/js/pages/weather-studio.js'),
    read('src/web/admin-ui/public/js/motion/weather-widget.js'),
    read('src/web/admin-ui/public/css/weather-widget.css'),
    read('src/web/admin-ui/public/js/motion/screen-preview.js')
  ]);

  assert.match(studio, /id="weather-animation-enabled"/);
  assert.match(studio, /id="weather-animation-speed"/);
  assert.match(studio, /id="weather-animation-intensity"/);
  assert.match(studio, /id="weather-widget-motion-enabled"/);
  assert.match(studio, /export function weatherStudioSettings/);
  assert.match(studio, /export async function loadWeatherForScreen/);
  assert.doesNotMatch(studio, /id="weather-target-list"/);
  assert.doesNotMatch(studio, /id="weather-apply"/);
  assert.match(studio, /Применить все анимации/);

  assert.match(widget, /animation_enabled/);
  assert.match(widget, /animation_speed/);
  assert.match(widget, /animation_intensity/);
  assert.match(widget, /widget_motion_enabled/);
  assert.match(widget, /if \(!config\.animation_enabled\) return atmosphere/);
  assert.match(widget, /layer\.dataset\.weatherAnimation/);
  assert.match(widget, /--weather-atmosphere-opacity/);
  assert.match(widget, /layer\.append\(atmosphere, widget\)/);
  assert.match(widget, /card\.style\.left = `\$\{\(config\.x \/ 1920\) \* 100\}%`/);
  assert.match(widget, /card\.style\.top = `\$\{\(config\.y \/ 1080\) \* 100\}%`/);

  assert.match(css, /data-weather-widget-motion="off"/);
  assert.match(css, /--weather-rain-duration/);
  assert.match(css, /--weather-hover-duration/);
  assert.match(css, /var\(--mira-menu-accent/);
  assert.match(css, /var\(--mira-menu-text/);
  assert.match(css, /background:\s*none\s*!important/);

  assert.match(preview, /--mira-menu-accent/);
  assert.match(preview, /--mira-menu-text/);
});

test('one application mechanism publishes all animation layers and weather to the same monitors', async () => {
  const [coordinator, settingsRoutes, weatherStudio, application] = await Promise.all([
    read('src/web/admin-ui/public/js/pages/animation-application.js'),
    read('src/api/settings/routes.js'),
    read('src/web/admin-ui/public/js/pages/weather-studio.js'),
    read('src/web/admin-ui/public/js/application.js')
  ]);

  assert.match(coordinator, /Применить все анимации/);
  assert.match(coordinator, /#animation-target-list/);
  assert.match(coordinator, /weatherStudioSettings\(\)/);
  assert.match(coordinator, /WEATHER_SETTINGS_ENDPOINT/);
  assert.match(coordinator, /Применено на сервере/);
  assert.doesNotMatch(weatherStudio, /weatherTargetScreenIds/);
  assert.doesNotMatch(weatherStudio, /\/api\/weather\/apply/);

  const applyStart = settingsRoutes.indexOf("router.put('/animation/apply'");
  const applyEnd = settingsRoutes.indexOf("router.put('/animation/entity-asset'", applyStart);
  const applyRoute = settingsRoutes.slice(applyStart, applyEnd);
  assert.ok(applyStart >= 0 && applyEnd > applyStart);
  assert.match(applyRoute, /applyAnimationSettingsToScreens/);
  assert.match(applyRoute, /applyWeatherSettingsToScreens/);
  assert.match(applyRoute, /'animation', 'environment', 'scene_playlist', 'entity', 'brand', 'announcement', 'weather'/);
  assert.match(applyRoute, /markScreenRenderChanged/);
  assert.match(applyRoute, /applied_screens/);

  assert.match(application, /initialiseAnimationApplication/);
});

test('offline weather cache is isolated by monitor and restores through Player Last Known Good state', async () => {
  const bootstrap = await read('src/web/admin-ui/public/js/player/weather-bootstrap.js');
  assert.match(bootstrap, /const CACHE_PREFIX = 'mira-tv\.weather\.last\.v2\.'/);
  assert.match(bootstrap, /loadLastKnownGood/);
  assert.match(bootstrap, /record\?\.screen_id \?\? context\?\.screen\?\.id/);
  assert.match(bootstrap, /return screenId \? `\$\{CACHE_PREFIX\}\$\{screenId\}` : ''/);
  assert.match(bootstrap, /settings:\s*\{ \.\.\.settings, screen_id: screenId \}/);
  assert.match(bootstrap, /legacyScreenId === screenId/);
  assert.doesNotMatch(bootstrap, /localStorage\.setItem\(LEGACY_CACHE_KEY/);
});

test('weather runtime changes rotate only the offline shell cache and preserve downloaded media data', async () => {
  const worker = await read('src/web/admin-ui/public/player-sw.js');
  assert.match(worker, /const SHELL_CACHE = 'mira-tv-player-shell-v21'/);
  assert.match(worker, /const DATA_CACHE = 'mira-tv-player-data-v18'/);
  assert.match(worker, /const LEGACY_SHELL_CACHE = 'mira-tv-player-shell-v20'/);
  assert.match(worker, /caches\.delete\(LEGACY_SHELL_CACHE\)/);
});
