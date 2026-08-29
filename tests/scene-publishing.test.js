import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenesRepository } from '../src/db/scenes.js';
import { buildPlayerState, deltaPlayerContext, fullPlayerContext } from '../src/services/player-context-service.js';

const publishedGraph = Object.freeze({
  schema_version: 1,
  name: 'Меню бара',
  display_count: 1,
  display_width: 1920,
  display_height: 1080,
  canvas_width: 1920,
  canvas_height: 1080,
  active_slide_id: 'slide-1',
  slides: [{
    id: 'slide-1',
    name: 'Слайд 1',
    duration_ms: 10000,
    transition: 'fade',
    background: { type: 'color', color: '#10141c', asset_url: '' },
    elements: [{
      id: 'element-table', type: 'table', x: 0, y: 0, width: 1000, height: 700,
      z_index: 1, opacity: 1, content: 'Меню', variant: 'default',
      style: { color: '#fff', font_size: 42, background: 'transparent', radius: 0 },
      effects: { shadow: false, glow: false, blur: 0 },
      animation: { entrance: 'none', loop: 'none', exit: 'none', duration_ms: 600 },
      data_binding: { source: 'catalog_products' },
      table: { active_only: true, row_limit: 12, volumes_l: [0.5, 1], show_producer: false, show_strength: true, show_color: false, show_filtration: false }
    }]
  }]
});

test('published scene repository writes immutable snapshot row instead of mutating draft', async () => {
  let captured;
  const queryable = {
    async query(sql, params) {
      captured = { sql, params };
      return { rows: [{
        id: 'scene-revision-r1', scene_id: 'scene-s1', revision_number: 1,
        schema_version: 1, scene_json: publishedGraph, published_by: 'admin', published_at: '2026-08-29T10:00:00.000Z'
      }] };
    }
  };
  const revision = await createScenesRepository(queryable).createSceneRevision({
    id: 'scene-revision-r1', sceneId: 'scene-s1', revisionNumber: 1,
    scene: publishedGraph, actor: 'admin', now: '2026-08-29T10:00:00.000Z'
  });
  assert.match(captured.sql, /INSERT INTO scene_revisions/);
  assert.doesNotMatch(captured.sql, /UPDATE scenes/);
  assert.equal(revision.revision_number, 1);
  assert.deepEqual(revision.scene, publishedGraph);
});

test('assignment repository points screen to exact published revision', async () => {
  const queries = [];
  const queryable = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (/INSERT INTO screen_scene_assignments/.test(sql)) return { rows: [{ screen_id: 7 }] };
      return { rows: [{
        screen_id: 7, scene_revision_id: 'scene-revision-r2', assigned_by: 'admin', assigned_at: '2026-08-29T10:00:00.000Z',
        scene_id: 'scene-s1', revision_number: 2, published_at: '2026-08-29T09:00:00.000Z', scene_name: 'Меню бара'
      }] };
    }
  };
  const assignment = await createScenesRepository(queryable).assignScreenSceneRevision(7, 'scene-revision-r2', 'admin', '2026-08-29T10:00:00.000Z');
  assert.match(queries[0].sql, /ON CONFLICT \(screen_id\) DO UPDATE/);
  assert.equal(queries[0].params[1], 'scene-revision-r2');
  assert.equal(assignment.scene_revision_id, 'scene-revision-r2');
  assert.equal(assignment.revision_number, 2);
});

test('player state uses assigned published revision and resolves catalog data for table binding', async () => {
  const calls = [];
  const store = {
    async getScreen(id) { calls.push(['screen', id]); return { id, name: 'TV 1', resolution: '1920×1080', status: 'ready', active: true, location_id: 1, location_name: 'Бар', location_number: 1 }; },
    async getScreenDraft() { return { rows: [], settings: {}, revision: 1 }; },
    async getScreenAnimationSettings() { return null; },
    async getScreenSceneAssignment() { return { scene_revision_id: 'scene-revision-r2' }; },
    async getSceneRevision(id) { calls.push(['revision', id]); return { id, scene_id: 'scene-s1', scene_name: 'Меню бара', revision_number: 2, published_at: '2026-08-29T09:00:00.000Z', scene: publishedGraph }; },
    async listProducts() { calls.push(['catalog']); return [{ id: 1, name: 'IPA', price_primary: '400', active: true }]; },
    async listProductsByIds() { return []; },
    async listPackagingByIds() { return []; }
  };
  const config = { playerFallbackPollSeconds: 60, playerLogBatchSize: 100, playerLogLocalMaxEntries: 5000, playerLogLocalMaxBytes: 10485760 };
  const state = await buildPlayerState(store, { screen_id: 7 }, config);
  const context = fullPlayerContext(state);
  assert.equal(context.scene.revision_id, 'scene-revision-r2');
  assert.deepEqual(context.scene.graph, publishedGraph);
  assert.equal(context.scene.catalog_products[0].name, 'IPA');
  assert.ok(calls.some(([name]) => name === 'catalog'));
});

test('player state does not fetch full catalog when published scene has no catalog table', async () => {
  let catalogReads = 0;
  const graph = structuredClone(publishedGraph);
  graph.slides[0].elements = [{ ...graph.slides[0].elements[0], type: 'text', data_binding: undefined, table: undefined }];
  const store = {
    async getScreen(id) { return { id, name: 'TV', resolution: '1920×1080', status: 'ready', active: true, location_id: 1 }; },
    async getScreenDraft() { return { rows: [], settings: {}, revision: 1 }; },
    async getScreenAnimationSettings() { return null; },
    async getScreenSceneAssignment() { return { scene_revision_id: 'scene-revision-r1' }; },
    async getSceneRevision() { return { id: 'scene-revision-r1', scene_id: 'scene-s1', scene_name: 'Текст', revision_number: 1, published_at: '2026-08-29T09:00:00.000Z', scene: graph }; },
    async listProducts() { catalogReads += 1; return []; },
    async listProductsByIds() { return []; },
    async listPackagingByIds() { return []; }
  };
  const config = { playerFallbackPollSeconds: 60, playerLogBatchSize: 100, playerLogLocalMaxEntries: 5000, playerLogLocalMaxBytes: 10485760 };
  await buildPlayerState(store, { screen_id: 1 }, config);
  assert.equal(catalogReads, 0);
});

test('scene component participates independently in player delta hashes', async () => {
  const components = {
    screen: { id: 1 }, menu: { draft: {}, products: [], packaging: [] }, animation: {}, environment: null,
    scene_playlist: null, entity: null, brand: null, announcement: null, scene: { revision_id: 'scene-revision-r2' }, runtime: {}
  };
  const state = { schema_version: 1, revision: 'new', hashes: Object.fromEntries(Object.keys(components).map((key) => [key, `${key}-hash-new-12345678901234567890`])), components };
  const known = { schema_version: 1, hashes: { ...state.hashes, scene: 'scene-hash-old-12345678901234567890' } };
  const delta = deltaPlayerContext(state, known);
  assert.deepEqual(Object.keys(delta.changed), ['scene']);
  assert.equal(delta.changed.scene.revision_id, 'scene-revision-r2');
});
