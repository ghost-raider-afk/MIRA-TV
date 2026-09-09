import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fonts = fs.readFileSync('src/web/admin-ui/public/css/fonts.css', 'utf8');
const serviceWorker = fs.readFileSync('src/web/admin-ui/public/player-sw.js', 'utf8');

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
    assert.match(fonts, new RegExp(`font-family:\\"${family.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\"`));
  }
  for (const asset of requiredFontAssets) {
    assert.ok(fonts.includes(asset), `fonts.css must reference ${asset}`);
    assert.ok(serviceWorker.includes(`'${asset}'`), `Player shell cache must include ${asset}`);
  }
  assert.match(serviceWorker, /mira-tv-player-shell-v18/);
  assert.match(serviceWorker, /mira-tv-player-data-v18/);
});
