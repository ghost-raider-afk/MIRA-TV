import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Manager cards and fullscreen use lightweight TV snapshots instead of scene runtimes', async () => {
  const [manager, routes, realtime, playerClient, player] = await Promise.all([
    read('src/web/admin-ui/public/js/pages/manager.js'),
    read('src/api/managers/view-routes.js'),
    read('src/realtime/player-realtime.js'),
    read('src/web/admin-ui/public/js/player/player-realtime-client.js'),
    read('src/web/admin-ui/public/js/player/player.js')
  ]);

  assert.doesNotMatch(manager, /PlayerSceneRenderer|previewRenderers|fullscreenRenderer/);
  assert.match(manager, /const snapshotUrls = new Map\(\)/);
  assert.match(manager, /URL\.createObjectURL/);
  assert.match(manager, /\/screens\/\$\{screenId\}\/preview/);
  assert.match(manager, /snapshotUrls\.get\(Number\(screen\.id\)\) \|\| await fetchSnapshot/);

  assert.match(routes, /requestScreenPreview/);
  assert.match(routes, /screenPreviewMeta/);
  assert.match(routes, /screenPreview/);
  assert.match(realtime, /type:'preview\.request'/);
  assert.match(playerClient, /mira:player-preview-request/);
  assert.match(player, /mira:player-preview-request/);
  assert.match(player, /publishPreviewFrame\(\)/);
});
