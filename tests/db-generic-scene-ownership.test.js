import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=(p)=>readFile(new URL(p,root),'utf8');

test('scene remains the only weather settings owner while runtime weather snapshots persist separately', async()=>{
  const [index, weatherRepository, sceneContract]=await Promise.all([
    read('src/db/index.js'),
    read('src/db/weather.js'),
    read('src/contracts/scene.js')
  ]);
  assert.match(index,/createWeatherRepository/);
  assert.match(index,/027-weather-snapshots/);
  assert.match(sceneContract,/export function sceneWeatherSettings/);
  assert.match(weatherRepository,/weather_snapshots/);
  assert.match(weatherRepository,/weather_provider_status/);
  assert.doesNotMatch(weatherRepository,/screen_weather_settings|config_json|saveWeatherSettings|applyWeatherSettings/);
  assert.match(index,/023-scene-ownership-cleanup/);
});
