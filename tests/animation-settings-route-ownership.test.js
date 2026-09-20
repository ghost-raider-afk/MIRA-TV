import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url); const read=(p)=>readFile(new URL(p,root),'utf8');

test('animation settings endpoint cannot mutate visual scene elements', async()=>{
  const [routes,screenRoutes,config]=await Promise.all([
    read('src/api/settings/routes.js'),
    read('src/api/screens/routes.js'),
    read('src/web/admin-ui/public/js/core/config.js')
  ]);
  assert.doesNotMatch(routes,/weatherWidgetInput|applyWeatherSettingsToScreens|replaceEntityAssetStream|animation\/entity-asset/);
  assert.match(routes,/\['animation', 'scene_playlist'\]/);
  assert.match(routes,/router\.put\('\/animation\/playlist'/);
  assert.match(routes,/router\.put\('\/animation\/playlist\/apply'/);
  assert.match(routes,/\['scene_playlist'\]/);
  assert.match(screenRoutes,/animationSettingsInput/);
  assert.match(screenRoutes,/scene_playlist:currentAnimation\?\.scene_playlist/);
  assert.match(screenRoutes,/changedComponents\.push\('animation'\)/);
  assert.doesNotMatch(config,/animationEntityAsset/);
});
