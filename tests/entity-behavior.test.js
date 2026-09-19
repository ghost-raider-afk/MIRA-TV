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

test('generic scene media owns playback while SceneMotionRuntime owns only menu motion', async () => {
  const [sceneMotion, player, sceneRenderer, elementRenderer, worker] = await Promise.all([
    read('js/motion/scene-motion-runtime.js'),
    read('js/player/player.js'),
    read('js/player/player-scene-renderer.js'),
    read('js/player/scene-element-renderer.js'),
    read('player-sw.js')
  ]);

  assert.match(sceneMotion, /new SceneRuntime/);
  assert.match(sceneMotion, /new WasmMotionDriver/);
  assert.match(sceneMotion, /mira:scene-playlist-mode/);
  assert.match(sceneMotion, /mira:player-active/);
  assert.match(sceneMotion, /visibilitychange/);
  assert.match(sceneMotion, /this\.runtime\.pause\(\)/);
  assert.doesNotMatch(sceneMotion, /compileEntityBehaviorProgram|entityMedia|data-motion-entity-layer/);

  assert.match(player, /new PlayerSceneRenderer\(playerStage\)/);
  assert.match(sceneRenderer, /new SceneMotionRuntime\(stage/);
  assert.match(sceneRenderer, /new SceneElementRenderer/);
  assert.doesNotMatch(sceneRenderer, /mira:entity-rendered|renderSceneEntity|context\.entity/);
  assert.match(elementRenderer, /document\.createElement\('video'\)/);
  assert.match(elementRenderer, /syncVideo/);
  assert.match(elementRenderer, /visibilitychange/);

  assert.ok(worker.includes('/js/player/scene-element-renderer.js'));
});
