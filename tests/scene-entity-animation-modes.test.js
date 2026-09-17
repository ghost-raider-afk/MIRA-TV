import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DEFAULT_SCENE_ENTITY, SCENE_ENTITY_ANIMATION_MODES, sceneEntityInput } from '../src/contracts/scene-entity.js';
import { compileEntityBehaviorProgram, entityAnimationFrames } from '../src/web/admin-ui/public/js/motion/entity-behavior.js';
import { createMotionScene, MOTION_LAYERS } from '../src/web/admin-ui/public/js/motion/scene-graph.js';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('scene entity supports static mode and diversified motion presets', () => {
  assert.deepEqual(SCENE_ENTITY_ANIMATION_MODES, ['none', 'cinematic', 'float', 'breathe', 'sway', 'drift', 'pulse', 'toast']);
  assert.equal(DEFAULT_SCENE_ENTITY.animation_mode, 'cinematic');
  assert.equal(sceneEntityInput({ animation_mode: 'none' }).animation_mode, 'none');
  assert.throws(() => sceneEntityInput({ animation_mode: 'unknown' }), /неподдерживаемое значение/);
  for (const mode of SCENE_ENTITY_ANIMATION_MODES.filter((value) => value !== 'none')) {
    const frames = entityAnimationFrames(mode);
    assert.ok(frames.length >= 3, `${mode} must have visible motion frames`);
    assert.equal(frames[0].offset, 0);
    assert.equal(frames.at(-1).offset, 1);
  }
});

test('static entity stays visible but creates no animation track', () => {
  const target = { dataset: { entityMotion: 'custom-object', entityAnimationMode: 'none' } };
  const scene = createMotionScene({
    root: {},
    nodes: [{
      id: 'entity.custom-object', kind: 'entity', layer: MOTION_LAYERS.ENTITY,
      target, order: 0, count: 1, depth: 10, transformOwner: 'entity-behavior'
    }]
  });
  const program = compileEntityBehaviorProgram(scene, { entity: { visible: true, id: 'custom-object', animation_mode: 'none' } });
  assert.equal(program.tracks.length, 0);
  assert.equal(program.metadata.animationMode, 'none');
  assert.ok(program.duration > 0);
});

test('entity editor exposes animation selector and direct pointer drag', async () => {
  const editor = await read('js/motion/entity-editor.js');
  assert.match(editor, /animation-entity-animation-mode/);
  assert.match(editor, /Без анимации/);
  assert.match(editor, /layer\.style\.pointerEvents = editable/);
  assert.match(editor, /data-entity-drag/);
  assert.match(editor, /pointermove/);
  assert.match(editor, /scenePerPixelX/);
  assert.match(editor, /onChange\?\.\(this\.getEntity\(\)\)/);
});
