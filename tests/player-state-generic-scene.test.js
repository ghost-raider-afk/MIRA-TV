import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');

test('Player state v7 contains only static scene components plus Local-first manifest', async () => {
  const [context, device, sync, weather] = await Promise.all([
    read('src/services/player-context-service.js'),
    read('src/api/device/public-routes.js'),
    read('src/web/admin-ui/public/js/player/player-state-sync.js'),
    read('src/api/weather/routes.js')
  ]);
  assert.match(context, /PLAYER_STATE_SCHEMA_VERSION = 7/);
  assert.match(context, /scene:canonicalScene/);
  assert.match(context, /content_manifest:contentManifest/);
  assert.doesNotMatch(context, /scene_video|scene_playlist|animation:/);
  assert.match(device, /new Set\(\['screen', 'menu', 'scene', 'content_manifest', 'runtime'\]\)/);
  assert.match(sync, /'screen', 'menu', 'scene', 'content_manifest', 'runtime'/);
  assert.doesNotMatch(sync, /scene_video|scene_playlist|'animation'/);
  assert.match(weather, /sceneWeatherSettings\(draft\?\.scene/);
});
