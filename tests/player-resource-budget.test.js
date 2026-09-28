import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('static TV runtime has no video decoder, motion loop or server FFmpeg path', async () => {
  const [renderer, elements, worker, docker, assets] = await Promise.all([
    read('src/web/admin-ui/public/js/player/player-scene-renderer.js'),
    read('src/web/admin-ui/public/js/player/scene-element-renderer.js'),
    read('src/web/admin-ui/public/player-sw.js'),
    read('Dockerfile'),
    read('src/services/scene-assets-service.js')
  ]);
  assert.doesNotMatch(renderer, /requestAnimationFrame|setInterval|SceneMotionRuntime|SceneVideoRuntime/);
  assert.doesNotMatch(elements, /HTMLVideoElement|video\.play|video\.pause|setInterval|requestAnimationFrame/);
  assert.doesNotMatch(worker, /scene-video-runtime|\/js\/motion\/|videoRequest/);
  assert.doesNotMatch(docker, /ffmpeg|chromium/i);
  assert.doesNotMatch(assets, /ffprobe|video\/mp4|video\/webm/);
});

test('TV preview uses a low-frequency deferred timer plus request-driven refresh, never a frame loop', async () => {
  const [player, background, realtime] = await Promise.all([
    read('src/web/admin-ui/public/js/player/player.js'),
    read('src/web/admin-ui/public/js/player/player-background-services.js'),
    read('src/realtime/player-realtime.js')
  ]);
  assert.match(player, /mira:player-preview-request/);
  assert.match(background, /requestPreview/);
  assert.match(background, /previewCaptureIntervalMs/);
  assert.match(background, /schedulePreview/);
  assert.match(background, /MIN_PREVIEW_INTERVAL_MS = 10_000/);
  assert.doesNotMatch(background, /setInterval|requestAnimationFrame/);
  assert.match(realtime, /preview\.request/);
});
