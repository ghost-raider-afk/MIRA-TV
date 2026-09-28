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

test('TV preview is request-driven rather than a permanent capture loop', async () => {
  const [player, background, realtime] = await Promise.all([
    read('src/web/admin-ui/public/js/player/player.js'),
    read('src/web/admin-ui/public/js/player/player-background-services.js'),
    read('src/realtime/player-realtime.js')
  ]);
  assert.match(player, /mira:player-preview-request/);
  assert.match(background, /requestPreview/);
  assert.doesNotMatch(background, /setInterval|schedulePreview|previewCaptureIntervalMs/);
  assert.match(realtime, /preview\.request/);
});
