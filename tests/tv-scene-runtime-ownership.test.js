import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('TV Player has one static renderer and no motion/video runtime', async () => {
  const [player, renderer, elements, stateSync, worker] = await Promise.all([
    read('src/web/admin-ui/public/js/player/player.js'),
    read('src/web/admin-ui/public/js/player/player-scene-renderer.js'),
    read('src/web/admin-ui/public/js/player/scene-element-renderer.js'),
    read('src/web/admin-ui/public/js/player/player-state-sync.js'),
    read('src/web/admin-ui/public/player-sw.js')
  ]);

  assert.match(player, /new PlayerSceneRenderer\(playerStage\)/);
  assert.doesNotMatch(player, /player-preview-capture\.js/);
  assert.doesNotMatch(player, /player-metrics\.js/);
  assert.match(player, /import\('\.\/player-background-services\.js'\)/);

  assert.match(renderer, /'screen',[\s\S]*'menu',[\s\S]*'scene',[\s\S]*'runtime'/);
  assert.doesNotMatch(renderer, /SceneMotionRuntime|ScenePlaylistRuntime|SceneVideoRuntime|\/motion\//);
  assert.match(renderer, /element\?\.type !== 'video'/);

  assert.match(elements, /element\?\.type !== 'video'/);
  assert.doesNotMatch(elements, /HTMLVideoElement|autoplay|playback_rate|scene-playlist-mode/);

  assert.match(stateSync, /'screen', 'menu', 'scene', 'content_manifest', 'runtime'/);
  assert.doesNotMatch(stateSync, /scene_video|scene_playlist|'animation'/);

  assert.match(worker, /const SHELL_CACHE = 'mira-tv-player-shell-v60'/);
  assert.match(worker, /const RETIRED_SHELL_CACHE = 'mira-tv-player-shell-v59'/);
  assert.doesNotMatch(worker, /['"]\/js\/motion\//);
  assert.doesNotMatch(worker, /['"]\/js\/player\/scene-video-runtime\.js['"]/);
  assert.doesNotMatch(worker, /['"][^'"]+\.(?:mp4|webm)(?:\?[^'"]*)?['"]/i);
});

test('removed motion and Render Agent modules stay physically absent', async () => {
  await assert.rejects(read('src/web/admin-ui/public/js/motion/scene-motion-runtime.js'));
  await assert.rejects(read('src/web/admin-ui/public/js/player/scene-video-runtime.js'));
  await assert.rejects(read('src/api/render-agent/public-routes.js'));
  await assert.rejects(read('tools/render-agent/agent.js'));
});

test('noncritical TV diagnostics are deferred until after the first rendered frame', async () => {
  const [player, background, dockerfile] = await Promise.all([
    read('src/web/admin-ui/public/js/player/player.js'),
    read('src/web/admin-ui/public/js/player/player-background-services.js'),
    read('Dockerfile')
  ]);

  assert.doesNotMatch(player, /^import .*player-preview-capture/m);
  assert.doesNotMatch(player, /^import .*player-metrics/m);
  assert.match(player, /finishPlayerBoot\(\)/);
  assert.match(player, /void ensureBackgroundServices\(\)\.then/);
  assert.match(background, /publishPlayerPreview/);
  assert.match(background, /createPlayerMetricsCollector/);
  assert.doesNotMatch(background, /setInterval|schedulePreview|previewCaptureIntervalMs/);
  assert.doesNotMatch(dockerfile, /ffmpeg|fonts-dejavu-core/);
});
