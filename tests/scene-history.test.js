import assert from 'node:assert/strict';
import test from 'node:test';
import { createSceneHistory, restoreAuthoringSnapshot } from '../src/web/admin-ui/public/js/scenes/history.js';
import { createElement, createScene, duplicateElement } from '../src/web/admin-ui/public/js/scenes/model.js';

function serverScene() {
  const scene = createScene({ name: 'История' });
  scene.id = 'scene-history';
  scene.server_revision = 7;
  scene.created_at = '2026-08-30T00:00:00.000Z';
  scene.updated_at = '2026-08-30T00:01:00.000Z';
  return scene;
}

test('Undo restores authoring state without rolling server concurrency metadata backwards', () => {
  const history = createSceneHistory();
  const scene = serverScene();
  history.capture(scene, null);
  scene.name = 'Изменено';
  scene.server_revision = 9;
  scene.updated_at = '2026-08-30T00:05:00.000Z';

  const restored = history.undo(scene, null);
  assert.equal(restored.scene.name, 'История');
  assert.equal(restored.scene.server_revision, 9);
  assert.equal(restored.scene.updated_at, '2026-08-30T00:05:00.000Z');
  assert.equal(restored.scene.id, 'scene-history');
});

test('Redo is cleared by a new edit and continuous groups create one history step', () => {
  const history = createSceneHistory();
  const scene = serverScene();
  history.capture(scene, null, 'text');
  scene.name = 'И';
  history.capture(scene, null, 'text');
  scene.name = 'Из';
  history.closeGroup();
  assert.equal(history.pastSize, 1);

  const undone = history.undo(scene, null);
  assert.equal(undone.scene.name, 'История');
  assert.equal(history.canRedo, true);
  history.capture(undone.scene, null);
  assert.equal(history.canRedo, false);
});

test('History is bounded and restore helper preserves current server metadata', () => {
  const history = createSceneHistory({ limit: 3 });
  const scene = serverScene();
  for (let index = 0; index < 6; index += 1) {
    history.capture(scene, null);
    scene.name = `Сцена ${index}`;
  }
  assert.equal(history.pastSize, 3);
  const restored = restoreAuthoringSnapshot({ ...scene, server_revision: 22 }, { scene: { ...scene, name: 'Снимок', server_revision: 1 }, selected_element_id: null });
  assert.equal(restored.scene.server_revision, 22);
  assert.equal(restored.scene.name, 'Снимок');
});

test('Element duplication keeps data/media settings but creates a new identity and top layer', () => {
  const scene = serverScene();
  const slide = scene.slides[0];
  const image = createElement('image', scene, slide);
  image.asset_id = 'media-11111111-1111-4111-8111-111111111111';
  slide.elements.push(image);
  const copy = duplicateElement(scene, slide, image.id);
  assert.ok(copy);
  assert.notEqual(copy.id, image.id);
  assert.equal(copy.asset_id, image.asset_id);
  assert.equal(copy.x, image.x + 32);
  assert.equal(copy.y, image.y + 32);
  assert.ok(copy.z_index > image.z_index);
});
