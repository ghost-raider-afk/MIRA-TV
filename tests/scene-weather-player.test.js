import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('TV and Manager weather endpoints prefer generic scene weather', async () => {
  const [player, device, manager] = await Promise.all([
    read('src/web/admin-ui/public/js/player/player-scene-renderer.js'),
    read('src/api/device/public-routes.js'),
    read('src/api/managers/view-routes.js')
  ]);
  assert.match(player, /sceneWeatherElement\(context\.scene\)/);
  assert.match(player, /sceneElementRenderer\.contentFor\(weatherElement\.id\)/);
  assert.match(device, /sceneWeatherSettings\(draft\?\.scene/);
  assert.match(manager, /sceneWeatherSettings\(draft\?\.scene/);
});
