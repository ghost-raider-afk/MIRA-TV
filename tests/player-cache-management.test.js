import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('cache management never evicts active, previous or staging content', async () => {
  const worker = await read('src/web/admin-ui/public/player-sw.js');
  assert.match(worker, /const SHELL_CACHE = 'mira-tv-player-shell-v49'/);
  assert.match(worker, /local_first:true, protocol:2/);
  assert.match(worker, /mira:player-cache-inspect/);
  assert.match(worker, /mira:player-cache-cleanup/);
  assert.match(worker, /mira:player-cache-redownload/);
  assert.match(worker, /cleanupAssetCache\(\[manifests\.active, manifests\.previous, manifests\.staging\]\)/);
  assert.match(worker, /ensureManifestAssets\(event\.data\?\.active, \{ force:true \}\)/);
  assert.match(worker, /cache: force \? 'reload' : 'force-cache'/);
  assert.doesNotMatch(worker, /arrayBuffer\s*\(|Content-Range|Partial Content/);
});

test('Player reports cache status and executes commands through negotiated protocol', async () => {
  const [sync, realtime] = await Promise.all([
    read('src/web/admin-ui/public/js/player/player-state-sync.js'),
    read('src/web/admin-ui/public/js/player/player-realtime-client.js')
  ]);
  assert.match(sync, /fetch\('\/api\/device\/cache-status'/);
  assert.match(sync, /cacheStatusSnapshot/);
  assert.match(sync, /navigator\.storage\?\.estimate/);
  assert.match(sync, /navigator\.storage\?\.persisted/);
  assert.match(sync, /mira:player-cache-inspect/);
  assert.match(sync, /mira:player-cache-cleanup/);
  assert.match(sync, /mira:player-cache-redownload/);
  assert.match(sync, /onCacheCommand\(message\)/);
  assert.match(realtime, /message\?\.type === 'cache\.command'/);
  assert.match(realtime, /mira:player-cache-command/);
});

test('TV network API and UI expose cache status without coupling it to scene count', async () => {
  const [adminRoutes, publicRoutes, screens, dbIndex] = await Promise.all([
    read('src/api/device/admin-routes.js'),
    read('src/api/device/public-routes.js'),
    read('src/web/admin-ui/public/js/pages/screens.js'),
    read('src/db/index.js')
  ]);
  assert.match(publicRoutes, /router\.post\('\/cache-status'/);
  assert.match(adminRoutes, /cache_status:/);
  assert.match(adminRoutes, /router\.post\('\/bindings\/:screenId\/cache-command'/);
  assert.match(adminRoutes, /sendCacheCommand\(screenId, action, requestId\)/);
  assert.match(screens, /data-tv-cache-action/);
  assert.match(screens, /data-cache-command="check"/);
  assert.match(screens, /data-cache-command="cleanup-unused"/);
  assert.match(screens, /data-cache-command="redownload-active"/);
  assert.match(dbIndex, /029-player-cache-status/);
  assert.doesNotMatch(screens, /sceneCount|singleScene|oneScene/);
});
