import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');

test('offline Player shell contains only static runtime dependencies', async () => {
  const [worker, html] = await Promise.all([read('player-sw.js'), read('player.html')]);
  assert.match(worker, /const SHELL_CACHE = 'mira-tv-player-shell-v57'/);
  assert.match(worker, /const RETIRED_SHELL_CACHE = 'mira-tv-player-shell-v56'/);
  assert.match(worker, /\/css\/player-scene\.css/);
  assert.match(worker, /\/brand\/themes\/premium-background\.svg/);
  assert.match(worker, /\/brand\/themes\/premium-approved-decor\.webp/);
  assert.match(worker, /\/brand\/themes\/chalk-background\.svg/);
  assert.match(worker, /\/brand\/themes\/chalk-approved-decor\.webp/);
  assert.match(worker, /\/brand\/themes\/brand-premium-background\.svg/);
  assert.match(worker, /\/brand\/themes\/brand-premium-approved-decor\.webp/);
  assert.doesNotMatch(worker, /\/brand\/themes\/(?:premium|chalk|brand-premium)-side\.svg/);
  assert.match(worker, /\/js\/player\/weather-widget\.js/);
  assert.match(worker, /\/js\/player\/menu-theme-runtime\.js/);
  assert.match(worker, /\/js\/player\/menu-theme-renderer\.js/);
  assert.match(worker, /\/js\/themes\/menu-theme-registry\.js/);
  assert.match(worker, /\/js\/player\/player-background-services\.js/);
  assert.doesNotMatch(worker, /\/js\/motion\/|scene-video-runtime|videoRequest/);
  assert.doesNotMatch(worker, /\.(?:mp4|webm)(?:['"\/?]|$)/);
  assert.match(html, /\/css\/player-scene\.css/);
});
