import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Manager preview is snapshot-only and never starts the live scene renderer', async () => {
  const [manager, routes, realtime, playerRealtime, player] = await Promise.all([
    read('src/web/admin-ui/public/js/pages/manager.js'),
    read('src/api/managers/view-routes.js'),
    read('src/realtime/player-realtime.js'),
    read('src/web/admin-ui/public/js/player/player-realtime-client.js'),
    read('src/web/admin-ui/public/js/player/player.js')
  ]);

  assert.doesNotMatch(manager, /PlayerSceneRenderer|weatherEndpoint|\/context/);
  assert.match(manager, /\/preview/);
  assert.match(manager, /URL\.createObjectURL/);
  assert.match(manager, /snapshotUrls/);

  assert.match(routes, /requestScreenPreview/);
  assert.match(routes, /screenPreview/);
  assert.match(routes, /X-MIRA-Preview-Updated-At/);

  assert.match(realtime, /type:\s*'preview\.request'/);
  assert.match(playerRealtime, /mira:player-preview-request/);
  assert.match(player, /mira:player-preview-request/);
  assert.match(player, /publishPreviewFrame\(\)/);
});
