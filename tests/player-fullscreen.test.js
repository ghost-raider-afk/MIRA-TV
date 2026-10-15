import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const publicRoot = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, publicRoot), 'utf8');

test('Player follows the visual viewport and retries fullscreen from a TV user gesture', async () => {
  const [html, css, fullscreen] = await Promise.all([
    read('player.html'),
    read('css/player.css'),
    read('js/player/player-fullscreen.js')
  ]);

  assert.match(html, /\/js\/player\/player-fullscreen\.js/);
  assert.match(css, /--mira-player-viewport-width/);
  assert.match(css, /--mira-player-viewport-height/);
  assert.match(css, /\.player-root\s*\{[^}]*position:\s*fixed;[^}]*width:\s*var\(--mira-player-viewport-width,[^}]*height:\s*var\(--mira-player-viewport-height,/s);

  assert.match(fullscreen, /window\.visualViewport/);
  assert.match(fullscreen, /root\.requestFullscreen \|\| root\.webkitRequestFullscreen/);
  assert.match(fullscreen, /window\.addEventListener\('pointerdown', enterFromGesture/);
  assert.match(fullscreen, /window\.addEventListener\('keydown', enterFromGesture/);
  assert.match(fullscreen, /playerVisible\(\)/);
  assert.match(fullscreen, /navigationUI:'hide'/);
});

test('offline Player shell carries the readable renderer and fullscreen helper atomically', async () => {
  const worker = await read('player-sw.js');
  assert.match(worker, /const RETIRED_SHELL_CACHE = 'mira-tv-player-shell-v63'/);
  assert.match(worker, /const SHELL_CACHE = 'mira-tv-player-shell-v64'/);
  assert.match(worker, /'\/js\/player\/player-fullscreen\.js'/);
  assert.match(worker, /'\/js\/editor\/renderer-layout\.js'/);
});
