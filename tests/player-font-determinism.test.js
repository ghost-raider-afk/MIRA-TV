import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fonts = fs.readFileSync('src/web/admin-ui/public/css/fonts.css', 'utf8');
const serviceWorker = fs.readFileSync('src/web/admin-ui/public/player-sw.js', 'utf8');
const flatMenuRenderer = fs.readFileSync('src/web/admin-ui/public/js/player/flat-menu-renderer.js', 'utf8');
const playerSceneRenderer = fs.readFileSync('src/web/admin-ui/public/js/player/player-scene-renderer.js', 'utf8');

const requiredFamilies = [
  'MIRA Sans',
  'MIRA Sans Condensed',
  'MIRA Serif',
  'Inter',
  'Arial',
  'Montserrat',
  'Oswald',
  'Arial Narrow',
  'DejaVu Sans Condensed',
  'Tahoma',
  'Georgia'
];

const requiredFontAssets = [
  '/fonts/DejaVuSans.ttf',
  '/fonts/DejaVuSans-Bold.ttf',
  '/fonts/DejaVuSansCondensed.ttf',
  '/fonts/DejaVuSansCondensed-Bold.ttf',
  '/fonts/DejaVuSerif.ttf',
  '/fonts/DejaVuSerif-Bold.ttf'
];

test('Player owns deterministic local font aliases instead of relying on TV system fonts', () => {
  for (const family of requiredFamilies) {
    assert.ok(fonts.includes(`font-family:"${family}"`), `fonts.css must own ${family}`);
  }
  for (const asset of requiredFontAssets) {
    assert.ok(fonts.includes(asset), `fonts.css must reference ${asset}`);
    assert.ok(serviceWorker.includes(`'${asset}'`), `Player shell cache must include ${asset}`);
  }
  assert.match(serviceWorker, /const SHELL_CACHE = 'mira-tv-player-shell-v33'/);
  assert.match(serviceWorker, /mira-tv-player-data-v18/);
});

test('Player loads the selected deterministic menu font before publishing SVG', () => {
  assert.match(flatMenuRenderer, /fonts\.load/);
  assert.match(flatMenuRenderer, /async render\(layer, svgMarkup, viewport = \{\}, typography = null\)/);
  assert.ok(
    flatMenuRenderer.indexOf('await ensureMenuFonts(typography)') < flatMenuRenderer.indexOf('layer.innerHTML = svg'),
    'selected font must be loaded before canonical SVG enters the DOM'
  );
  assert.match(playerSceneRenderer, /flatMenuRenderer\.render\(menuLayer, menuSvg, viewport, layout\.typography\)/);
});
