import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');

test('offline Player shell contains only static runtime dependencies', async () => {
  const [worker, html] = await Promise.all([read('player-sw.js'), read('player.html')]);
  assert.match(worker, /const SHELL_CACHE = 'mira-tv-player-shell-v52'/);
  assert.match(worker, /const RETIRED_SHELL_CACHE = 'mira-tv-player-shell-v51'/);
  assert.match(worker, /\/css\/player-scene\.css/);
  assert.match(worker, /\/js\/player\/weather-widget\.js/);
  assert.match(worker, /\/js\/player\/player-background-services\.js/);
  assert.doesNotMatch(worker, /\/js\/motion\/|scene-video-runtime|videoRequest/);
  assert.doesNotMatch(worker, /\.(?:mp4|webm)(?:['"\/?]|$)/);
  assert.match(html, /\/css\/player-scene\.css/);
});
