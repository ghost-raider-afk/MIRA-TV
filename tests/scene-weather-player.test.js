import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('TV and Manager weather use the saved static scene with no baked/video ownership', async () => {
  const [player, device, manager] = await Promise.all([
    read('src/web/admin-ui/public/js/player/player-scene-renderer.js'),
    read('src/api/device/public-routes.js'),
    read('src/api/managers/view-routes.js')
  ]);

  assert.match(player, /const staticScene =/);
  assert.match(player, /sceneWeatherElement\(staticScene\)/);
  assert.match(player, /sceneElementRenderer\.contentFor\(weatherElement\.id\)/);
  assert.equal((player.match(/autoDiscoverLayer:false/g) || []).length, 2);
  assert.doesNotMatch(player, /scene_video|baked|SceneVideoRuntime|SceneMotionRuntime/);

  assert.match(device, /sceneWeatherSettings\(draft\?\.scene, session\.screen_id\)/);
  assert.doesNotMatch(device, /bakedScene|getBakedScene|sceneVideoToken|scene_video/);

  assert.match(manager, /sceneWeatherSettings\(draft\?\.scene, id\)/);
  assert.doesNotMatch(manager, /bakedScene|getBakedScene|scene_video/);
});
