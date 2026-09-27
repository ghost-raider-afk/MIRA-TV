import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Manager uses on-demand TV snapshots instead of a second scene renderer', async () => {
  const [manager, routes, realtime, client, player, background] = await Promise.all([
    read('src/web/admin-ui/public/js/pages/manager.js'),
    read('src/api/managers/view-routes.js'),
    read('src/realtime/player-realtime.js'),
    read('src/web/admin-ui/public/js/player/player-realtime-client.js'),
    read('src/web/admin-ui/public/js/player/player.js'),
    read('src/web/admin-ui/public/js/player/player-background-services.js')
  ]);
  assert.doesNotMatch(manager, /PlayerSceneRenderer|previewRenderers|fullscreenRenderer/);
  assert.match(manager, /URL\.createObjectURL/);
  assert.match(routes, /requestScreenPreview/);
  assert.match(realtime, /type:'preview\.request'/);
  assert.match(client, /mira:player-preview-request/);
  assert.match(player, /mira:player-preview-request/);
  assert.match(background, /publishPlayerPreview/);
  assert.doesNotMatch(background, /setInterval|schedulePreview/);
});
