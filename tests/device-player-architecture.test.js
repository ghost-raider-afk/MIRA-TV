import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Player stays public while TV connection remains admin protected', async () => {
  const [server, routes, html, manifest] = await Promise.all([
    read('src/server.js'), read('src/web/admin-ui/routes.js'),
    read('src/web/admin-ui/public/player.html'), read('src/web/admin-ui/public/player.webmanifest')
  ]);
  const protectedPages = routes.match(/AUTHENTICATED_PAGES = Object\.freeze\(\[[\s\S]*?\]\);/)?.[0] || '';
  assert.match(protectedPages, /path:\s*'\/connect-tv'/);
  assert.doesNotMatch(protectedPages, /path:\s*'\/player'/);
  assert.doesNotMatch(protectedPages, /path:\s*'\/playlist'/);
  assert.match(server, /app\.get\('\/player'/);
  assert.match(server, /app\.use\('\/api\/device', createDevicePublicRouter/);
  assert.match(html, /data-tv-player/);
  const parsed = JSON.parse(manifest);
  assert.equal(parsed.start_url, '/player');
  assert.equal(parsed.scope, '/player');
});

test('Android TV compatibility helper is shared by active static renderers', async () => {
  const [compat, elements, worker] = await Promise.all([
    read('src/web/admin-ui/public/js/core/dom-compat.js'),
    read('src/web/admin-ui/public/js/player/scene-element-renderer.js'),
    read('src/web/admin-ui/public/player-sw.js')
  ]);
  assert.match(compat, /typeof node\.replaceChildren === 'function'/);
  assert.match(compat, /while \(node\.firstChild\) node\.removeChild\(node\.firstChild\)/);
  assert.match(elements, /replaceChildrenCompat/);
  assert.match(worker, /'\/js\/core\/dom-compat\.js'/);
  assert.doesNotMatch(worker, /\/js\/motion\//);
});

test('real TV Player uses one static renderer, WebSocket and Local-first state', async () => {
  const [player, renderer, sync, store, realtime, context, device, worker] = await Promise.all([
    read('src/web/admin-ui/public/js/player/player.js'),
    read('src/web/admin-ui/public/js/player/player-scene-renderer.js'),
    read('src/web/admin-ui/public/js/player/player-state-sync.js'),
    read('src/web/admin-ui/public/js/player/player-store.js'),
    read('src/web/admin-ui/public/js/player/player-realtime-client.js'),
    read('src/services/player-context-service.js'),
    read('src/api/device/public-routes.js'),
    read('src/web/admin-ui/public/player-sw.js')
  ]);
  assert.match(player, /new PlayerSceneRenderer\(playerStage\)/);
  assert.match(player, /restoreLastKnownGood\(\)/);
  assert.match(sync, /'screen', 'menu', 'scene', 'content_manifest', 'runtime'/);
  assert.match(sync, /fetchWithTimeout\('\/api\/device\/player-delta'/);
  assert.match(store, /PREVIOUS_KNOWN_GOOD_KEY/);
  assert.match(realtime, /new WebSocket\(/);
  assert.match(context, /PLAYER_STATE_SCHEMA_VERSION = 7/);
  assert.doesNotMatch(context, /scene_video:|scene_playlist:|animation:/);
  assert.match(device, /playerRuntimeHash\(config, currentRevision\)/);
  assert.doesNotMatch(device, /getBakedScene|sceneVideoToken/);
  assert.doesNotMatch(renderer, /SceneMotionRuntime|SceneVideoRuntime|ScenePlaylistRuntime/);
  assert.match(worker, /mira-tv-player-shell-v52/);
});

test('Player boot defers noncritical background work until a scene is rendered', async () => {
  const [player, background] = await Promise.all([
    read('src/web/admin-ui/public/js/player/player.js'),
    read('src/web/admin-ui/public/js/player/player-background-services.js')
  ]);
  assert.doesNotMatch(player, /^import .*player-preview-capture/m);
  assert.doesNotMatch(player, /^import .*player-metrics/m);
  assert.match(player, /finishPlayerBoot\(\)/);
  assert.match(player, /ensureBackgroundServices/);
  assert.match(background, /publishPlayerPreview/);
  assert.match(background, /createPlayerMetricsCollector/);
  assert.doesNotMatch(background, /setInterval|schedulePreview|previewCaptureIntervalMs/);
});
