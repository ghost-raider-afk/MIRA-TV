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

test('TV Player and Preview share one SceneMotionRuntime ownership model', async () => {
  const [player, preview, runtime, plan, worker] = await Promise.all([
    read('js/player/player.js'),
    read('js/motion/preview-player.js'),
    read('js/motion/scene-motion-runtime.js'),
    read('js/motion/motion-plan.js'),
    read('player-sw.js')
  ]);

  assert.match(player, /new SceneMotionRuntime\(playerStage/);
  assert.match(player, /sceneMotionRuntime\.render\(/);
  assert.doesNotMatch(player, /new GpuSceneRuntime|new WasmMotionDriver|new LiveMenuMotion/);

  assert.match(preview, /new SceneMotionRuntime\(stage/);
  assert.doesNotMatch(preview, /new SceneRuntime|new WasmMotionDriver/);

  assert.match(runtime, /buildDomMotionScene/);
  assert.match(runtime, /new WasmMotionDriver/);
  assert.match(runtime, /compileEntityBehaviorProgram/);
  assert.match(runtime, /\.\.\.DEFAULT_SCENE_COMPILERS/);
  assert.match(runtime, /if \(this\.plan\?\.tracks\?\.length\)/);

  assert.match(plan, /compileMenuMotionProgram/);
  assert.match(plan, /compilePromotionMotionProgram/);
  assert.match(plan, /context\.menuEnabled === false/);

  assert.ok(worker.includes('/wasm/mira-motion-kernel.wasm'));
});
