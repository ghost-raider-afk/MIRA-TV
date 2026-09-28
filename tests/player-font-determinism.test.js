import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fonts = fs.readFileSync('src/web/admin-ui/public/css/fonts.css', 'utf8');
const sw = fs.readFileSync('src/web/admin-ui/public/player-sw.js', 'utf8');
const flat = fs.readFileSync('src/web/admin-ui/public/js/player/flat-menu-renderer.js', 'utf8');
const renderer = fs.readFileSync('src/web/admin-ui/public/js/player/player-scene-renderer.js', 'utf8');

test('Player keeps deterministic local fonts cached for TV rendering', () => {
  for (const asset of ['/fonts/DejaVuSans.ttf','/fonts/DejaVuSans-Bold.ttf','/fonts/DejaVuSansCondensed.ttf','/fonts/DejaVuSansCondensed-Bold.ttf']) {
    assert.ok(fonts.includes(asset), asset);
    assert.ok(sw.includes("'" + asset + "'"), asset);
  }
  assert.match(sw, /mira-tv-player-shell-v56/);
  assert.match(sw, /mira-tv-player-data-v18/);
});

test('selected menu font loads before shared vector SVG enters the DOM', () => {
  assert.match(flat, /fonts\.load/);
  assert.ok(flat.indexOf('await ensureMenuFonts(typography)') < flat.indexOf('layer.innerHTML = svg'));
  assert.match(renderer, /flatMenuRenderer\.render\(menuLayer, menuSvg, canonicalViewport, layout\.typography\)/);
});
