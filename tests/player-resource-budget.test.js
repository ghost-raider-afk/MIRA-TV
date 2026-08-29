import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const publicRoot = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, publicRoot), 'utf8');

test('cached TV video never copies the full asset into JavaScript memory for Range handling', async () => {
  const source = await read('player-sw.js');
  const match = source.match(/async function videoRequest\(request\) \{([\s\S]*?)\n\}/);
  assert.ok(match, 'videoRequest() must remain explicit and auditable');
  const implementation = match[1];

  assert.doesNotMatch(implementation, /arrayBuffer\s*\(/, 'video Range handling must not materialize the full cached video in JS memory');
  assert.doesNotMatch(implementation, /\.slice\s*\(/, 'video Range handling must not copy byte ranges in JS');
  assert.match(implementation, /if \(cached\)[\s\S]*return cached;/, 'cached video must be returned as the original streaming Response');
  assert.match(implementation, /request\.headers\.has\('range'\)/, 'uncached Range requests must stay on the native HTTP path');
});

test('TV Entity runtime is event-driven and pauses hidden motion plus video', async () => {
  const source = await read('js/player/entity-runtime.js');
  assert.doesNotMatch(source, /MutationObserver|requestAnimationFrame|cancelAnimationFrame/, 'Entity runtime must not watch the whole Player DOM or schedule frame loops');
  assert.match(source, /mira:entity-rendered/);
  assert.match(source, /mira:scene-playlist-mode/);
  assert.match(source, /mira:player-active/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /runtime\.pause\(\)/);
  assert.match(source, /media\.pause\(\)/);
  assert.doesNotMatch(source, /dataset\.playerActive|dataset\.playerPageVisible/, 'Entity owner must not own global Player visibility state');
});

test('Player owner publishes visibility while GPU and CSS animations suspend invisible pixels', async () => {
  const [player, gpu, css] = await Promise.all([
    read('js/player/player.js'),
    read('js/player/gpu-scene-runtime.js'),
    read('css/motion-overlays.css')
  ]);
  assert.match(player, /playerStage\.dataset\.playerActive/);
  assert.match(player, /playerStage\.dataset\.playerPageVisible/);
  assert.match(player, /dispatchPlayerActivity\(false\)/);
  assert.match(player, /dispatchPlayerActivity\(true\)/);
  assert.doesNotMatch(gpu, /requestAnimationFrame/);
  assert.match(gpu, /mira:player-active/);
  assert.match(gpu, /mira:scene-playlist-mode/);
  assert.match(gpu, /visibilitychange/);
  assert.match(gpu, /animation\.pause\(\)/);
  assert.match(css, /data-player-active="false"/);
  assert.match(css, /data-player-page-visible="false"/);
  assert.match(css, /data-scene-playlist-fullscreen="true"/);
  assert.match(css, /animation-play-state:paused!important/);
});
