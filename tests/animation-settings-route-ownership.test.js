import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url); const read=(p)=>readFile(new URL(p,root),'utf8');

test('animation settings endpoint cannot mutate visual scene elements', async()=>{
  const [routes,config]=await Promise.all([
    read('src/api/settings/routes.js'),
    read('src/web/admin-ui/public/js/core/config.js')
  ]);
  assert.doesNotMatch(routes,/weatherWidgetInput|applyWeatherSettingsToScreens|replaceEntityAssetStream|animation\/entity-asset/);
  assert.match(routes,/\['animation', 'scene_playlist'\]/);
  assert.doesNotMatch(config,/animationEntityAsset/);
});
