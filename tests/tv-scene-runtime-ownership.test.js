import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('LiveMenuMotion does not compile Entity behavior a second time', async () => {
  const source = await read('js/motion/live-menu-motion.js');
  assert.doesNotMatch(source, /compileEntityBehaviorProgram/);
  assert.match(source, /compilers:\s*DEFAULT_SCENE_COMPILERS/);
});

test('TV Player owns menu motion through one coarse compositor runtime', async () => {
  const [player, gpu, worker] = await Promise.all([
    read('js/player/player.js'),
    read('js/player/gpu-scene-runtime.js'),
    read('player-sw.js')
  ]);
  assert.match(player, /GpuSceneRuntime/);
  assert.doesNotMatch(player, /LiveMenuMotion|WasmMotionDriver/);
  assert.doesNotMatch(gpu, /requestAnimationFrame|style\.filter|drop-shadow/);
  assert.match(gpu, /effect\.animate\(/);
  assert.ok(!worker.includes('/wasm/mira-motion-kernel.wasm'));
});
