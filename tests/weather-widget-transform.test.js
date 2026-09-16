import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { completeWeatherWidget, weatherWidgetInput } from '../src/contracts/weather.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('weather widget stores canonical 1920x1080 coordinates and scale', () => {
  const value = weatherWidgetInput({
    enabled: false,
    position: 'top-right',
    x: 777,
    y: 333,
    scale: 1.75,
    width_px: 520
  });
  assert.equal(value.x, 777);
  assert.equal(value.y, 333);
  assert.equal(value.scale, 1.75);
  assert.equal(value.width_px, 520);
});

test('legacy weather positions migrate to stable coordinates and transform limits are safe', () => {
  assert.deepEqual(
    (({ x, y }) => ({ x, y }))(completeWeatherWidget({ position: 'bottom-left' })),
    { x: 260, y: 890 }
  );
  const bounded = completeWeatherWidget({ x: -100, y: 5000, scale: 10 });
  assert.equal(bounded.x, 1660);
  assert.equal(bounded.y, 190);
  assert.equal(bounded.scale, 1);
});

test('weather editor keeps atmosphere independent from the floating table-coloured informer', async () => {
  const [studio, widget, css, preview] = await Promise.all([
    read('src/web/admin-ui/public/js/pages/weather-studio.js'),
    read('src/web/admin-ui/public/js/motion/weather-widget.js'),
    read('src/web/admin-ui/public/css/weather-widget.css'),
    read('src/web/admin-ui/public/js/motion/screen-preview.js')
  ]);

  assert.match(studio, /id="weather-scale"/);
  assert.match(studio, /id="weather-x"/);
  assert.match(studio, /id="weather-y"/);
  assert.match(studio, /data-weather-align="center"/);
  assert.match(studio, /pointermove/);
  assert.match(studio, /\* 1920/);
  assert.match(studio, /\* 1080/);

  assert.match(widget, /layer\.append\(atmosphere, widget\)/);
  assert.match(widget, /dataset\.weatherAtmosphere = 'true'/);
  assert.match(widget, /card\.style\.left = `\$\{\(config\.x \/ 1920\) \* 100\}%`/);
  assert.match(widget, /card\.style\.top = `\$\{\(config\.y \/ 1080\) \* 100\}%`/);
  assert.match(widget, /--weather-scale/);

  assert.match(css, /\.weather-atmosphere\s*\{[\s\S]*?inset:\s*0;/);
  assert.match(css, /rgba\(205,232,252,/);
  assert.match(css, /var\(--mira-menu-accent/);
  assert.match(css, /var\(--mira-menu-text/);
  assert.match(css, /background:\s*none\s*!important/);
  assert.match(css, /translate\(-50%,\s*-50%\)\s*scale\(var\(--weather-scale\)\)/);

  assert.match(preview, /--mira-menu-accent/);
  assert.match(preview, /--mira-menu-text/);
});

test('weather targeting is independent from playlist targets and defaults to one current monitor', async () => {
  const [studio, routes, repository] = await Promise.all([
    read('src/web/admin-ui/public/js/pages/weather-studio.js'),
    read('src/api/weather/routes.js'),
    read('src/db/weather.js')
  ]);

  assert.match(studio, /const weatherTargetScreenIds = new Set\(\)/);
  assert.match(studio, /id="weather-target-list"/);
  assert.match(studio, /id="weather-target-current"/);
  assert.match(studio, /id="weather-target-all"/);
  assert.match(studio, /id="weather-target-none"/);
  assert.match(studio, /weatherTargetScreenIds\.add\(currentId\)/);
  assert.doesNotMatch(studio, /#animation-target-list input\[type="checkbox"\]:checked/);
  assert.match(studio, /ENDPOINTS\.screen\(ids\[0\]\)/);
  assert.match(routes, /router\.get\('\/screens\/:screenId'/);
  assert.match(repository, /ON CONFLICT \(screen_id\) DO UPDATE/);
});
