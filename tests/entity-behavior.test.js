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

test('preview and TV player keep one explicit runtime owner for entity behavior and cache it offline', async () => {
  const [adapter, preview, liveMotion, player, playerHtml, entityRuntime, worker, entityEditor] = await Promise.all([
    read('js/motion/dom-scene-adapter.js'),
    read('js/motion/preview-player.js'),
    read('js/motion/live-menu-motion.js'),
    read('js/player/player.js'),
    read('player.html'),
    read('js/player/entity-runtime.js'),
    read('player-sw.js'),
    read('js/motion/entity-editor.js')
  ]);
  assert.match(entityEditor, /animation-scene-entity-motion/);
  assert.match(entityEditor, /motion\.dataset\.entityMotion = entity\.id/);
  assert.match(adapter, /\[data-entity-motion\]/);
  assert.match(adapter, /id: `entity\.\$\{target\.dataset\.entityMotion \|\| index\}`/);
  assert.match(preview, /compileEntityBehaviorProgram/);
  assert.match(preview, /entity:\s*this\.entity/);

  assert.doesNotMatch(liveMotion, /compileEntityBehaviorProgram/);
  assert.match(liveMotion, /compilers:\s*DEFAULT_SCENE_COMPILERS/);
  assert.doesNotMatch(player, /LiveMenuMotion|WasmMotionDriver/);
  assert.match(player, /new GpuSceneRuntime\(playerStage/);

  assert.match(playerHtml, /\/js\/player\/entity-runtime\.js/);
  assert.match(entityRuntime, /compileEntityBehaviorProgram/);
  assert.match(entityRuntime, /compilers:\s*\[compileEntityBehaviorProgram\]/);

  for (const asset of [
    '/js/player/entity-runtime.js', '/js/player/flat-menu-renderer.js',
    '/js/player/scene-layer-composer.js', '/js/player/gpu-scene-runtime.js',
    '/js/motion/entity-behavior.js', '/js/motion/dom-scene-adapter.js',
    '/js/motion/scene-graph.js', '/js/motion/scene-composer.js', '/js/motion/scene-runtime.js',
    '/js/motion/timeline.js', '/js/motion/drivers/waapi-driver.js'
  ]) assert.ok(worker.includes(asset), `offline shell is missing ${asset}`);

  for (const retiredPlayerAsset of [
    '/js/motion/live-menu-motion.js', '/js/motion/drivers/wasm-motion-driver.js',
    '/js/motion/wasm-motion-kernel.js', '/wasm/mira-motion-kernel.wasm'
  ]) assert.ok(!worker.includes(retiredPlayerAsset), `offline shell still carries ${retiredPlayerAsset}`);
});
