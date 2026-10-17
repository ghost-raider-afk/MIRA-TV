import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Manager preview uses the canonical PlayerSceneRenderer without physical TV capture loops', async () => {
  const [manager, routes, realtime, client, player, background] = await Promise.all([
    read('src/web/admin-ui/public/js/pages/manager.js'),
    read('src/api/managers/view-routes.js'),
    read('src/realtime/player-realtime.js'),
    read('src/web/admin-ui/public/js/player/player-realtime-client.js'),
    read('src/web/admin-ui/public/js/player/player.js'),
    read('src/web/admin-ui/public/js/player/player-background-services.js')
  ]);

  assert.match(manager, /PlayerSceneRenderer/);
  assert.match(manager, /previewRenderers/);
  assert.match(manager, /fullscreenRenderer/);
  assert.match(manager, /\/screens\/\$\{screenId\}\/context/);
  assert.doesNotMatch(manager, /URL\.createObjectURL|\/preview|setInterval/);
  assert.match(routes, /\/screens\/:id\/context/);
  assert.doesNotMatch(routes, /screenPreview|\/screens\/:id\/preview|requestScreenPreview/);

  // Physical screenshots remain an administrator/player diagnostic path, not Manager Preview.
  assert.match(realtime, /type:'preview\.request'/);
  assert.match(client, /mira:player-preview-request/);
  assert.match(player, /mira:player-preview-request/);
  assert.match(background, /publishPlayerPreview/);
  assert.match(background, /const PREVIEW_SETTLE_MS = 1500;/);
  assert.match(background, /previewTimer = setTimeout/);
  assert.doesNotMatch(background, /setInterval/);
});

test('Manager proposals and administrator approvals stay behind their existing role boundaries', async () => {
  const [server, managerRoutes, adminRoutes] = await Promise.all([
    read('src/server.js'),
    read('src/api/managers/view-routes.js'),
    read('src/api/managers/admin-routes.js')
  ]);

  assert.match(server, /app\.use\('\/api\/manager', requireApiRole\('manager'\), managerViewRouter\)/);
  assert.match(server, /app\.use\('\/api\/admin\/managers', requireApiRole\('administrator'\), managerAdminRouter\)/);
  assert.match(managerRoutes, /router\.post\('\/proposals'/);
  assert.match(managerRoutes, /managerUsername:request\.session\.sub/);
  assert.match(adminRoutes, /\/proposals\/:id\/approve/);
  assert.match(adminRoutes, /\/proposals\/:id\/reject/);
});
