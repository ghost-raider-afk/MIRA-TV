import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sceneWeatherSettings } from '../src/contracts/scene.js';

test('scene weather element maps to embedded runtime settings', () => {
  const settings = sceneWeatherSettings({ version:1, elements:[{ id:'w', type:'weather', enabled:true, width:520, weather:{ location_name:'Хельсинки', latitude:60.17, longitude:24.94, timezone:'Europe/Helsinki' } }] }, 7);
  assert.equal(settings.screen_id, 7);
  assert.equal(settings.enabled, true);
  assert.equal(settings.embedded, true);
  assert.equal(settings.location_name, 'Хельсинки');
});

test('monitor editor Preview excludes scene elements while Player keeps generic weather ownership', async () => {
  const [renderer, preview] = await Promise.all([
    readFile(new URL('../src/web/admin-ui/public/js/player/scene-element-renderer.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/web/admin-ui/public/js/editor/preview.js', import.meta.url), 'utf8')
  ]);
  assert.match(renderer, /renderWeatherWidget/);
  assert.match(renderer, /contentFor\(elementId\)/);
  assert.doesNotMatch(preview, /SceneElementRenderer|weatherPreview|data-scene-elements-layer/);
});
