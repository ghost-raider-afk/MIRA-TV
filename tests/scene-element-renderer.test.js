import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('generic scene elements use keyed static DOM ownership', async () => {
  const renderer = await read('js/player/scene-element-renderer.js');
  assert.match(renderer, /this\.entries = new Map\(\)/);
  assert.match(renderer, /this\.entries\.get\(id\)/);
  assert.match(renderer, /element\?\.type !== 'video'/);
  assert.match(renderer, /function responsiveContent\(element\)/);
  assert.match(renderer, /\['weather', 'image', 'logo'\]\.includes/);
  assert.match(renderer, /content\.style\.transform = 'none'/);
  assert.match(renderer, /refreshContentGeometry\(elementId\)/);
  assert.doesNotMatch(renderer, /HTMLVideoElement|autoplay|playback_rate|visibilitychange|mira:scene-playlist-mode/);
});

test('shared Player Scene Renderer owns scene elements and weather', async () => {
  const player = await read('js/player/player-scene-renderer.js');
  assert.match(player, /new SceneElementRenderer\(this\.sceneLayers\.ensure\('scene'/);
  assert.match(player, /new PlayerWeatherRuntime/);
  assert.match(player, /sceneWeatherElement\(staticScene\)/);
  assert.doesNotMatch(player, /SceneVideoRuntime|SceneMotionRuntime|ScenePlaylistRuntime/);
});
