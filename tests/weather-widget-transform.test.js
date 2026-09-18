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
  assert.match(widget, /export const WEATHER_SCENE_WIDTH = 1920/);
  assert.match(widget, /export const WEATHER_SCENE_HEIGHT = 1080/);
  assert.match(widget, /card\.style\.left = `\$\{\(config\.x \/ WEATHER_SCENE_WIDTH\) \* 100\}%`/);
  assert.match(widget, /card\.style\.top = `\$\{\(config\.y \/ WEATHER_SCENE_HEIGHT\) \* 100\}%`/);
  assert.match(studio, /Math\.min\(width \/ WEATHER_SCENE_WIDTH, height \/ WEATHER_SCENE_HEIGHT\)/);
  assert.match(studio, /originX:\s*rect\.left \+ stage\.clientLeft/);
  assert.match(studio, /originY:\s*rect\.top \+ stage\.clientTop/);
  assert.match(studio, /\(event\.clientX - metrics\.originX - metrics\.offsetX\) \/ metrics\.scale/);
  assert.match(studio, /\(event\.clientY - metrics\.originY - metrics\.offsetY\) \/ metrics\.scale/);

  assert.match(css, /data-weather-widget-motion="off"/);
  assert.match(css, /--weather-rain-duration/);
  assert.match(css, /--weather-hover-duration/);
  assert.match(css, /var\(--mira-menu-accent/);
  assert.match(css, /var\(--mira-menu-text/);
  assert.match(css, /background:\s*none\s*!important/);

  assert.match(preview, /--mira-menu-accent/);
  assert.match(preview, /--mira-menu-text/);
});

test('one atomic application publishes all animation layers and weather to the same monitors', async () => {
  const [playlist, settingsRoutes, weatherStudio, application] = await Promise.all([
    read('src/web/admin-ui/public/js/pages/playlist.js'),
    read('src/api/settings/routes.js'),
    read('src/web/admin-ui/public/js/pages/weather-studio.js'),
    read('src/web/admin-ui/public/js/pages/animation-application.js')
  ]);

  assert.match(playlist, /API\.animationApply/);
  assert.match(playlist, /screen_ids:\s*ids/);
  assert.match(playlist, /activePreviewScreenId\s*\?\s*\[activePreviewScreenId\]/);
  assert.match(playlist, /mira:animation-object-switch-changed/);
  assert.match(playlist, /const weather = weatherSnapshot \|\| weatherStudioSettings\(\)/);
  assert.match(playlist, /screen_ids:\s*ids, settings:\s*desired, weather/);
  assert.doesNotMatch(application, /\/api\/weather\/settings/);
  assert.doesNotMatch(application, /\.click\(\)/);
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
});

test('offline weather restores through canonical Player LKG and keeps cache isolated by monitor', async () => {
  const [stateSync, weatherRuntime] = await Promise.all([
    read('src/web/admin-ui/public/js/player/player-state-sync.js'),
    read('src/web/admin-ui/public/js/player/weather-bootstrap.js')
  ]);

  assert.match(stateSync, /loadLastKnownGood/);
  assert.match(stateSync, /'entity', 'weather', 'brand'/);
  assert.match(stateSync, /await applyContext\(record\.context, \[\.\.\.ALL_COMPONENTS\]/);

  assert.match(weatherRuntime, /const CACHE_PREFIX = 'mira-tv\.weather\.last\.v2\.'/);
  assert.match(weatherRuntime, /this\.screenId \? `\$\{CACHE_PREFIX\}\$\{this\.screenId\}` : ''/);
  assert.match(weatherRuntime, /settings:\s*\{ \.\.\.this\.settings, screen_id: this\.screenId \}/);
  assert.match(weatherRuntime, /legacyScreenId === this\.screenId/);
  assert.match(weatherRuntime, /applyContext\(settings, screenId/);
  assert.doesNotMatch(weatherRuntime, /loadLastKnownGood/);
  assert.doesNotMatch(weatherRuntime, /localStorage\.setItem\(LEGACY_CACHE_KEY/);
});

test('weather runtime changes rotate only the offline shell cache and preserve downloaded media data', async () => {
  const worker = await read('src/web/admin-ui/public/player-sw.js');
  assert.match(worker, /const SHELL_CACHE = 'mira-tv-player-shell-v22'/);
  assert.match(worker, /const DATA_CACHE = 'mira-tv-player-data-v18'/);
  assert.match(worker, /const RETIRED_SHELL_CACHE = 'mira-tv-player-shell-v20'/);
  assert.match(worker, /const LEGACY_SHELL_CACHE = 'mira-tv-player-shell-v21'/);
  assert.match(worker, /caches\.delete\(LEGACY_SHELL_CACHE\)/);
});
