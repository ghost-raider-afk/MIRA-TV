import test from 'node:test';
import assert from 'node:assert/strict';
import { scenePayloadInput, sceneRevision } from '../src/contracts/scene.js';
import { createScenesRepository } from '../src/db/scenes.js';
import { createElement, createScene } from '../src/web/admin-ui/public/js/scenes/model.js';

function validScene() {
  const scene = createScene({ displayCount: 3 });
  const table = createElement('table', scene, scene.slides[0]);
  scene.slides[0].elements.push(table);
  return scene;
}

test('server scene contract derives canonical panoramic canvas and strips client metadata', () => {
  const input = validScene();
  input.server_revision = 9;
  const scene = scenePayloadInput(input);
  assert.equal(scene.display_count, 3);
  assert.equal(scene.canvas_width, 5760);
  assert.equal(scene.canvas_height, 1080);
  assert.equal(scene.slides.length, 1);
  assert.equal(scene.slides[0].elements[0].data_binding.source, 'catalog_items');
  assert.equal(scene.slides[0].elements[0].table.price_layout, 'single');
  assert.equal('server_revision' in scene, false);
  assert.equal('id' in scene, false);
});

test('server scene contract migrates legacy product binding to beer class', () => {
  const input = validScene();
  const table = input.slides[0].elements[0];
  table.data_binding = { source: 'catalog_products' };
  table.table = { active_only: true, row_limit: 12, volumes_l: [0.5, 1] };
  const scene = scenePayloadInput(input);
  const migrated = scene.slides[0].elements[0];
  assert.equal(migrated.data_binding.source, 'catalog_items');
  assert.equal(migrated.table.class_code, 'beer');
  assert.equal(migrated.table.price_layout, 'quantities');
});

test('server scene contract rejects geometry outside the global canvas', () => {
  const input = validScene();
  input.slides[0].elements[0].x = 5700;
  input.slides[0].elements[0].width = 500;
  assert.throws(() => scenePayloadInput(input), /element\.x/);
});

test('server scene contract rejects duplicate element ids across slides', () => {
  const input = validScene();
  const duplicate = structuredClone(input.slides[0]);
  duplicate.id = `${duplicate.id}-copy`;
  input.slides.push(duplicate);
  assert.throws(() => scenePayloadInput(input), /Идентификаторы элементов/);
});

test('server scene revision must be a positive safe integer', () => {
  assert.equal(sceneRevision(7), 7);
  assert.throws(() => sceneRevision(0), /server_revision/);
});

test('scene list repository returns light summaries instead of full scene graphs', async () => {
  const queryable = {
    async query() {
      return {
        rows: [{
          id: 'scene-1',
          name: 'Бар',
          schema_version: 1,
          scene_json: { display_count: 2, canvas_width: 3840, canvas_height: 1080, slides: [{}, {}] },
          revision: 4,
          created_at: '2026-08-29T00:00:00.000Z',
          updated_at: '2026-08-29T01:00:00.000Z'
        }]
      };
    }
  };
  const [summary] = await createScenesRepository(queryable).listScenes();
  assert.equal(summary.slide_count, 2);
  assert.equal(summary.server_revision, 4);
  assert.equal(summary.canvas_width, 3840);
  assert.equal('slides' in summary, false);
});

test('scene update repository uses optimistic revision and returns incremented revision', async () => {
  let captured;
  const queryable = {
    async query(sql, params) {
      captured = { sql, params };
      return {
        rows: [{
          id: 'scene-1', name: 'Новая', schema_version: 1,
          scene_json: { name: 'Новая', display_count: 1, slides: [] },
          revision: 6, created_at: '2026-08-29T00:00:00.000Z', updated_at: '2026-08-29T01:00:00.000Z'
        }]
      };
    }
  };
  const updated = await createScenesRepository(queryable).updateSceneRecord(
    'scene-1', { name: 'Новая', schema_version: 1, display_count: 1, slides: [] }, 5, 'admin', '2026-08-29T01:00:00.000Z'
  );
  assert.match(captured.sql, /revision = revision \+ 1/);
  assert.equal(captured.params.at(-1), 5);
  assert.equal(updated.server_revision, 6);
});
