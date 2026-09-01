import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('shared renderer keeps authoring aspect ratio optional for fixed runtime hosts', async () => {
  const [renderer, playback, runtime] = await Promise.all([
    read('src/web/admin-ui/public/js/scene-runtime/renderer.js'),
    read('src/web/admin-ui/public/js/scene-runtime/playback.js'),
    read('src/web/admin-ui/public/js/player/published-scene-runtime.js')
  ]);

  assert.match(renderer, /applySceneStage\(stage, scene, slide, \{ constrainAspect = true \} = \{\}\)/);
  assert.match(renderer, /stage\.style\.aspectRatio = constrainAspect \?/);
  assert.match(playback, /applySceneStage\(this\.stage, scene, slide, \{ constrainAspect: this\.stage !== this\.layer \}\)/);
  assert.match(runtime, /new ScenePlaybackRuntime\(\{ stage: layer, layer \}\)/);
});

test('published Scene owns a fullscreen isolated Player layer', async () => {
  const [css, composer] = await Promise.all([
    read('src/web/admin-ui/public/css/player.css'),
    read('src/web/admin-ui/public/js/player/scene-layer-composer.js')
  ]);

  assert.match(css, /\.tv-player-published-scene-layer \{ z-index: 7; overflow: hidden; pointer-events: none; contain: layout paint style; \}/);
  assert.match(css, /\.tv-player-announcement-layer,\.tv-player-published-scene-layer \{ position: absolute; inset: 0; \}/);
  assert.match(composer, /id: 'scene'.*className: 'tv-player-published-scene-layer'/);
});
