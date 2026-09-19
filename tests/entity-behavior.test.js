import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BEER_GLASS_BEHAVIOR, beerGlassFrames, compileEntityBehaviorProgram } from '../src/web/admin-ui/public/js/motion/entity-behavior.js';
import { createMotionScene, MOTION_LAYERS } from '../src/web/admin-ui/public/js/motion/scene-graph.js';
import { toWaapiKeyframe } from '../src/web/admin-ui/public/js/motion/drivers/waapi-driver.js';

const publicRoot = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, publicRoot), 'utf8');

test('beer glass behavior follows explicit idle/event state sequence without hiding entity', () => {
  assert.deepEqual(BEER_GLASS_BEHAVIOR.states, ['IDLE', 'SOFT_EVENT', 'IDLE', 'SPECIAL_SCENE', 'IDLE']);
  assert.equal(BEER_GLASS_BEHAVIOR.duration, 24000);
  const frames = beerGlassFrames();
  assert.equal(frames[0].offset, 0);
  assert.equal(frames.at(-1).offset, 1);
  assert.ok(frames.every((frame) => frame.opacity === 1));
  assert.ok(frames.some((frame) => Math.abs(frame.transform.rotateDeg) >= 4));
  assert.ok(frames.some((frame) => frame.transform.y <= -20));
  assert.ok(frames.some((frame) => frame.appearance.glowRadius >= 9));
});

test('entity compiler owns only the inner beer glass target', () => {
  const target = {};
  const scene = createMotionScene({
    root: {},
    nodes: [{
      id: 'entity.beer-glass', kind: 'entity', layer: MOTION_LAYERS.ENTITY,
      target, order: 0, count: 1, depth: 10, transformOwner: 'entity-behavior'
    }]
  });
  const program = compileEntityBehaviorProgram(scene, { entity: { visible: true } });
  assert.equal(program.id, 'beer-glass-behavior');
  assert.equal(program.tracks.length, 1);
  assert.equal(program.tracks[0].node.target, target);
  assert.deepEqual(program.tracks[0].claims, ['transform', 'appearance']);
});

test('WAAPI serializer supports renderer-neutral entity rotation', () => {
  const keyframe = toWaapiKeyframe(beerGlassFrames()[4], ['transform']);
  assert.match(keyframe.transform, /translate3d\(/);
  assert.match(keyframe.transform, /rotate\(-2\.50deg\)/);
  assert.match(keyframe.transform, /scale\(/);
});

test('preview and TV player share one explicit SceneMotionRuntime owner for entity behavior and cache it offline', async () => {
  const [adapter, preview, liveMotion, sceneMotion, player, sceneRenderer, playerHtml, worker, entityEditor] = await Promise.all([
    read('js/motion/dom-scene-adapter.js'),
    read('js/motion/preview-player.js'),
    read('js/motion/live-menu-motion.js'),
    read('js/motion/scene-motion-runtime.js'),
    read('js/player/player.js'),
    read('js/player/player-scene-renderer.js'),
    read('player.html'),
    read('player-sw.js'),
    read('js/motion/entity-editor.js')
  ]);

  assert.match(entityEditor, /animation-scene-entity-motion/);
  assert.match(entityEditor, /motion\.dataset\.entityMotion = entity\.id/);
  assert.match(adapter, /\[data-entity-motion\]/);
  assert.match(adapter, /id: `entity\.\$\{target\.dataset\.entityMotion \|\| index\}`/);

  assert.match(preview, /new SceneMotionRuntime\(stage/);
  assert.doesNotMatch(preview, /compileEntityBehaviorProgram|new SceneRuntime|new WasmMotionDriver/);

  assert.match(sceneMotion, /compileEntityBehaviorProgram/);
  assert.match(sceneMotion, /\.\.\.DEFAULT_SCENE_COMPILERS/);
  assert.match(sceneMotion, /new SceneRuntime/);
  assert.match(sceneMotion, /new WasmMotionDriver/);
  assert.match(sceneMotion, /mira:scene-playlist-mode/);
  assert.match(sceneMotion, /mira:player-active/);
  assert.match(sceneMotion, /visibilitychange/);
  assert.match(sceneMotion, /this\.runtime\.pause\(\)/);
  assert.match(sceneMotion, /this\.entityMedia\.pause\(\)/);

  assert.doesNotMatch(liveMotion, /compileEntityBehaviorProgram/);
  assert.match(liveMotion, /compilers:\s*DEFAULT_SCENE_COMPILERS/);

  assert.match(player, /new PlayerSceneRenderer\(playerStage\)/);
  assert.match(sceneRenderer, /new SceneMotionRuntime\(stage/);
  assert.doesNotMatch(player, /LiveMenuMotion|GpuSceneRuntime|new WasmMotionDriver/);
  assert.doesNotMatch(sceneRenderer, /LiveMenuMotion|GpuSceneRuntime/);
  assert.match(sceneRenderer, /mira:entity-rendered/);
  assert.match(player, /mira:player-active/);

  assert.doesNotMatch(playerHtml, /entity-runtime\.js|gpu-scene-runtime\.js/);

  for (const asset of [
    '/js/player/player-scene-renderer.js','/js/player/flat-menu-renderer.js','/js/player/scene-layer-composer.js',
    '/js/motion/scene-motion-runtime.js','/js/motion/entity-behavior.js','/js/motion/dom-scene-adapter.js',
    '/js/motion/scene-graph.js','/js/motion/scene-composer.js','/js/motion/scene-runtime.js',
    '/js/motion/timeline.js','/js/motion/drivers/waapi-driver.js','/js/motion/drivers/wasm-motion-driver.js',
    '/js/motion/wasm-motion-kernel.js'
  ]) assert.ok(worker.includes(asset), `offline shell is missing ${asset}`);

  for (const retiredPlayerAsset of [
    '/js/player/entity-runtime.js','/js/player/gpu-scene-runtime.js','/js/motion/live-menu-motion.js'
  ]) assert.ok(!worker.includes(retiredPlayerAsset), `offline shell still carries ${retiredPlayerAsset}`);
});
