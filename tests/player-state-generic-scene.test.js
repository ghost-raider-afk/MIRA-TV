import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url); const read=(p)=>readFile(new URL(p,root),'utf8');

test('Player state v4 has one visual scene owner', async()=>{
  const [context,device,sync,weather,screens]=await Promise.all([
    read('src/services/player-context-service.js'),
    read('src/api/device/public-routes.js'),
    read('src/web/admin-ui/public/js/player/player-state-sync.js'),
    read('src/api/weather/routes.js'),
    read('src/api/screens/routes.js')
  ]);
  assert.match(context,/PLAYER_STATE_SCHEMA_VERSION = 4/);
  assert.match(context,/menu:\s*\{ draft:\s*\{ rows: draft\.rows \|\| \[\], settings: draft\.settings \|\| \{\} \}/);
  assert.doesNotMatch(context,/draft:\s*\{[^}]*revision:\s*draft\.revision/);
  assert.doesNotMatch(context,/getScreenWeatherSettings|components\.entity|components\.brand|components\.announcement|components\.environment|components\.weather/);
  assert.match(device,/\['screen', 'menu', 'scene', 'animation', 'scene_playlist', 'runtime'\]/);
  assert.doesNotMatch(device,/getScreenWeatherSettings/);
  assert.doesNotMatch(sync,/context\?\.entity/);
  assert.match(weather,/sceneWeatherSettings\(draft\?\.scene/);
  assert.doesNotMatch(weather,/getWeatherSettings|updateWeatherSettings|applyWeatherSettingsToScreens/);
  assert.doesNotMatch(screens,/getScreenWeatherSettings|applyWeatherSettingsToScreens/);
});
