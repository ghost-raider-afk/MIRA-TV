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
  assert.match(implementation, /request\.headers\.has\('range'\)/, 'Range requests must stay explicit');
  assert.match(implementation, /networkWithTimeout\(request, 8000\)/, 'online Range requests must preserve native HTTP byte ranges');
  assert.match(implementation, /return cached \|\| Response\.error\(\)/, 'complete cache must remain the offline fallback without JS slicing');
});

test('Unified TV scene runtime is event-driven and pauses hidden motion plus video', async () => {
  const source = await read('js/motion/scene-motion-runtime.js');
  assert.doesNotMatch(source, /MutationObserver|requestAnimationFrame|cancelAnimationFrame/, 'Entity runtime must not watch the whole Player DOM or schedule frame loops');
  assert.match(source, /mira:scene-playlist-mode/);
  assert.match(source, /mira:player-active/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /this\.runtime\.pause\(\)/);
  assert.doesNotMatch(source, /entityMedia|data-motion-entity-layer/);
  assert.match(source, /activityControlled/);
  assert.doesNotMatch(source, /setInterval|MutationObserver/, 'Scene runtime must stay event-driven');
});

test('Player activity suspends menu motion and generic scene video without legacy CSS owners', async () => {
  const [player, motion, elements] = await Promise.all([
    read('js/player/player.js'),
    read('js/motion/scene-motion-runtime.js'),
    read('js/player/scene-element-renderer.js')
  ]);
  assert.match(player, /playerStage\.dataset\.playerActive/);
  assert.match(player, /playerStage\.dataset\.playerPageVisible/);
  assert.match(player, /dispatchPlayerActivity\(false\)/);
  assert.match(player, /dispatchPlayerActivity\(true\)/);
  assert.doesNotMatch(motion, /requestAnimationFrame/);
  assert.match(motion, /mira:player-active/);
  assert.match(motion, /mira:scene-playlist-mode/);
  assert.match(motion, /visibilitychange/);
  assert.match(motion, /this\.runtime\.pause\(\)/);
  assert.match(elements, /mira:player-active/);
  assert.match(elements, /visibilitychange/);
  assert.match(elements, /video\.pause\(\)/);
  assert.doesNotMatch(elements, /MutationObserver|setInterval/);
});
