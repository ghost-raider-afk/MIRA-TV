import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('shared Scene animation runtime owns transitions and element entrance/exit', async () => {
  const [animation, playback, styles] = await Promise.all([
    read('src/web/admin-ui/public/js/scene-runtime/animation.js'),
    read('src/web/admin-ui/public/js/scene-runtime/playback.js'),
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
  assert.match(playback, /transitionSceneLayer/);
  assert.match(playback, /playSceneElementEntrances/);
  assert.match(playback, /void this\.advanceSlide\(\)/);
  assert.match(playback, /syncClockTimer\(\)/);
  assert.match(playback, /syncMediaPlayback\(\)/);
  assert.doesNotMatch(playback, /requestAnimationFrame/);
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

test('Editor Preview and Published Player delegate to one ScenePlaybackRuntime', async () => {
  const [editor, player, playback] = await Promise.all([
    read('src/web/admin-ui/public/js/scenes/editor.js'),
    read('src/web/admin-ui/public/js/player/published-scene-runtime.js'),
    read('src/web/admin-ui/public/js/scene-runtime/playback.js')
  ]);

  assert.match(editor, /import \{ ScenePlaybackRuntime \} from '\.\.\/scene-runtime\/playback\.js'/);
  assert.match(editor, /previewRuntime = new ScenePlaybackRuntime/);
  assert.match(editor, /previewRuntime\.load\(state\.scene, sceneRendererContext\(\)/);
  assert.match(editor, /previewRuntime\.clear\(\)/);
  assert.doesNotMatch(editor, /transitionSceneLayer/);

  assert.match(player, /import \{ ScenePlaybackRuntime \} from '\.\.\/scene-runtime\/playback\.js'/);
  assert.match(player, /this\.playback = new ScenePlaybackRuntime/);
  assert.match(player, /this\.playback\.load\(graph, this\.rendererContext\(\)/);
  assert.match(player, /this\.playback\.updateContext\(this\.rendererContext\(\), \{ weatherOnly: true \}\)/);

  assert.match(playback, /this\.transitioning = true/);
  assert.match(playback, /if \(!this\.enabled \|\| this\.transitioning\) return/);
  assert.match(playback, /updateSceneWeatherElements\(this\.layer, this\.currentSlide/);
});
