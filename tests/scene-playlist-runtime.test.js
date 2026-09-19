import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Scene Playlist runtime preserves an active timeline when Player Context is unchanged', async () => {
  const [runtime, player, sceneRenderer] = await Promise.all([
    read('js/motion/scene-playlist-runtime.js'),
    read('js/player/player.js'),
    read('js/player/player-scene-renderer.js')
  ]);

  assert.match(runtime, /function playbackSignature\(playlist, entity\)/);
  assert.match(runtime, /this\.playbackActive && sameLayers && this\.signature === nextSignature/);
  assert.match(runtime, /this\.playlist = nextPlaylist/);
  assert.match(runtime, /this\.entity = entity/);
  assert.match(player, /new PlayerSceneRenderer\(playerStage\)/);
  assert.match(sceneRenderer, /this\.scenePlaylistRuntime\.render\(context\.scene_playlist/);
  assert.doesNotMatch(runtime, /scene-graph\.js/);
});

test('Scene Playlist owns only content and its FX subhost while MenuScene remains an external base layer', async () => {
  const [runtime, sceneMotion, preview] = await Promise.all([
    read('js/motion/scene-playlist-runtime.js'),
    read('js/motion/scene-motion-runtime.js'),
    read('js/motion/screen-preview.js')
  ]);

  assert.match(runtime, /data-scene-playlist-fx-host/);
  assert.match(runtime, /contentLayer\.replaceChildren/);
  assert.match(runtime, /classList\.toggle\('scene-menu-suppressed', scene\.mode === 'fullscreen'\)/);
  assert.doesNotMatch(runtime, /menuLayer\.replaceChildren/);
  assert.match(sceneMotion, /buildDomMotionScene/);
  assert.match(sceneMotion, /DEFAULT_SCENE_COMPILERS/);
  assert.match(preview, /data-scene-menu-layer/);
  assert.match(preview, /data-scene-fx-layer/);
  assert.match(preview, /data-scene-content-layer/);
});
