import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('shared Scene animation runtime owns transitions and element entrance/exit', async () => {
  const [animation, player, styles] = await Promise.all([
    read('src/web/admin-ui/public/js/scene-runtime/animation.js'),
    read('src/web/admin-ui/public/js/player/published-scene-runtime.js'),
    read('src/web/admin-ui/public/css/scene-renderer.css')
  ]);

  for (const transition of ['fade', 'crossfade', 'slide', 'zoom', 'wipe']) {
    assert.match(animation, new RegExp(`case '${transition}'`));
  }
  assert.match(animation, /element\.animation\?\.entrance/);
  assert.match(animation, /element\.animation\?\.exit/);
  assert.match(animation, /node\.animate\(keyframes/);
  assert.match(animation, /prefers-reduced-motion/);
  assert.doesNotMatch(animation, /requestAnimationFrame/);
  assert.match(player, /transitionSceneLayer/);
  assert.match(player, /playSceneElementEntrances/);
  assert.match(player, /void this\.advanceSlide\(\)/);
  assert.match(styles, /\.scene-transition-frame/);
});

test('slide transition keeps outgoing and incoming frames alive during WAAPI animation', async () => {
  const animation = await read('src/web/admin-ui/public/js/scene-runtime/animation.js');
  assert.match(animation, /moveChildren\(layer, outgoing\)/);
  assert.match(animation, /layer\.append\(outgoing, incoming\)/);
  assert.match(animation, /renderSceneLayer\(incoming/);
  assert.match(animation, /playSceneElementExits\(outgoing, fromSlide\)/);
  assert.match(animation, /playSceneElementEntrances\(incoming, toSlide\)/);
  assert.match(animation, /await Promise\.allSettled/);
  assert.match(animation, /moveChildren\(incoming, layer\)/);
});

test('dynamic weather does not cancel an in-flight slide transition', async () => {
  const player = await read('src/web/admin-ui/public/js/player/published-scene-runtime.js');
  assert.match(player, /if \(onlyDynamicDataChanged\) \{/);
  assert.match(player, /if \(!this\.transitioning\) \{[\s\S]*updateSceneWeatherElements/);
  assert.match(player, /this\.transitioning = true/);
  assert.match(player, /updateSceneWeatherElements\(this\.layer, activeSlide\(this\)/);
});
