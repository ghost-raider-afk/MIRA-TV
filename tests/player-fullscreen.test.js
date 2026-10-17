import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const publicRoot = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, publicRoot), 'utf8');

test('Player follows the visual viewport and retries fullscreen from a TV OK gesture', async () => {
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
  assert.match(fullscreen, /request\.call\(root\)/);
  assert.doesNotMatch(fullscreen, /navigationUI/);
  assert.match(fullscreen, /window\.addEventListener\('pointerdown', enterFromGesture/);
  assert.match(fullscreen, /window\.addEventListener\('keydown', enterFromGesture/);
  assert.match(fullscreen, /\['Enter', 'NumpadEnter', 'Select'\]/);
  assert.match(fullscreen, /\[13, 23\]/);
  assert.match(fullscreen, /playerVisible\(\)/);
});

test('failed automatic fullscreen shows one brief non-blocking OK hint', async () => {
  const [css, fullscreen] = await Promise.all([
    read('css/player.css'),
    read('js/player/player-fullscreen.js')
  ]);
  assert.match(fullscreen, /let hintShown = false/);
  assert.match(fullscreen, /if \(hintShown \|\|/);
  assert.match(fullscreen, /Нажмите OK для полноэкранного режима/);
  assert.match(fullscreen, /showFullscreenHint\(\)/);
  assert.match(css, /\.player-fullscreen-hint/);
  assert.match(css, /animation:\s*mira-player-fullscreen-hint 5s/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /@keyframes mira-player-fullscreen-hint/);
});

test('Player reports fullscreen mode diagnostics only on lifecycle changes', async () => {
  const fullscreen = await read('js/player/player-fullscreen.js');
  assert.match(fullscreen, /type:'fullscreen\.state'/);
  assert.match(fullscreen, /mode: apiFullscreen/);
  assert.match(fullscreen, /'fullscreen-api'/);
  assert.match(fullscreen, /'display-fullscreen'/);
  assert.match(fullscreen, /'standalone'/);
  assert.match(fullscreen, /'browser'/);
  assert.match(fullscreen, /fullscreen_enabled/);
  assert.match(fullscreen, /request_supported/);
  assert.match(fullscreen, /last_error/);
  assert.match(fullscreen, /mira:player-active/);
  assert.match(fullscreen, /mira:player-realtime-connected/);
  assert.doesNotMatch(fullscreen, /setInterval/);
});

test('offline Player shell carries the readable renderer and fullscreen helper atomically', async () => {
  const worker = await read('player-sw.js');
  const retiredVersion = Number(worker.match(/^const RETIRED_SHELL_CACHE = 'mira-tv-player-shell-v(\d+)'/m)?.[1]);
  const activeVersion = Number(worker.match(/^const SHELL_CACHE = 'mira-tv-player-shell-v(\d+)'/m)?.[1]);
  assert.ok(Number.isSafeInteger(retiredVersion), 'retired Player shell cache must be versioned');
  assert.ok(Number.isSafeInteger(activeVersion), 'active Player shell cache must be versioned');
  assert.equal(activeVersion, retiredVersion + 1);
  assert.match(worker, /'\/js\/player\/player-fullscreen\.js'/);
  assert.match(worker, /'\/js\/editor\/renderer-layout\.js'/);
});
