import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { initialiseSchema } from '../src/db/migrations/schema.js';
import { migratePrototypeScenes } from '../src/db/migrations/prototype-scenes.js';
import { migrateScenePublishing } from '../src/db/migrations/scene-publishing.js';
import { createScenesRepository } from '../src/db/scenes.js';
import { createScreensRepository } from '../src/db/screens.js';
import { buildPlayerState, deltaPlayerContext, fullPlayerContext } from '../src/services/player-context-service.js';

const memoryDb = newDb({ autoCreateForeignKeyIndices: true });
const { Pool } = memoryDb.adapters.createPg();
const pool = new Pool();
const scenes = createScenesRepository(pool);
const screens = createScreensRepository(pool);

const graph = Object.freeze({
  schema_version: 1,
  name: 'E2E Scene',
  display_count: 1,
  display_width: 1920,
  display_height: 1080,
  canvas_width: 1920,
  canvas_height: 1080,
  active_slide_id: 'slide-e2e',
  slides: [{
    id: 'slide-e2e',
    name: 'Основной',
    duration_ms: 12000,
    transition: 'fade',
    background: { type: 'color', color: '#10141c', asset_url: '' },
    elements: [{
      id: 'element-e2e-table', type: 'table', x: 60, y: 80, width: 1800, height: 820,
      z_index: 1, opacity: 1, content: 'Меню', variant: 'default',
      style: { color: '#ffffff', font_size: 42, background: 'transparent', radius: 0 },
      effects: { shadow: false, glow: false, blur: 0 },
      animation: { entrance: 'none', loop: 'none', exit: 'none', duration_ms: 600 },
      data_binding: { source: 'catalog_products' },
      table: { active_only: true, row_limit: 12, volumes_l: [0.5, 1], show_producer: false, show_strength: true, show_color: false, show_filtration: false }
    }]
  }]
});

let screenId;

async function seedOperationsData() {
  const now = new Date().toISOString();
  const location = await pool.query(
    `INSERT INTO locations (name, address, active, created_at, updated_at)
     VALUES ($1, '', TRUE, $2, $2) RETURNING id`,
    [`E2E ${crypto.randomUUID()}`, now]
  );
  const screen = await pool.query(
    `INSERT INTO screens (location_id, location_number, name, resolution, status, active, created_at, updated_at)
     VALUES ($1, 1, 'TV E2E', '1920×1080', 'ready', TRUE, $2, $2) RETURNING id`,
    [location.rows[0].id, now]
  );
  screenId = Number(screen.rows[0].id);
  await pool.query(
    `INSERT INTO screen_drafts (screen_id, rows_json, settings_json, revision, updated_at)
     VALUES ($1, '[]', '{}', 1, $2)`,
    [screenId, now]
  );
  await pool.query(
    `INSERT INTO catalog_products
      (name, producer, characteristics, strength, price_primary, price_secondary, alcoholic, beverage_color, filtration, active, created_at, updated_at)
     VALUES ('IPA E2E', '', '', '6%', '400', '', TRUE, 'light', 'filtered', TRUE, $1, $1)`,
    [now]
  );
}

async function listProducts() {
  const { rows } = await pool.query('SELECT * FROM catalog_products ORDER BY id');
  return rows;
}

const config = {
  playerFallbackPollSeconds: 60,
  playerLogBatchSize: 100,
  playerLogLocalMaxEntries: 5000,
  playerLogLocalMaxBytes: 10 * 1024 * 1024
};

test.before(async () => {
  await initialiseSchema(pool);
  await migratePrototypeScenes(pool);
  await migrateScenePublishing(pool);
  await seedOperationsData();
});

test.after(async () => {
  await pool.end();
});

test('Draft -> immutable revision -> screen assignment -> Player Context works through the real PostgreSQL schema', async () => {
  const now = new Date().toISOString();
  const sceneId = `scene-${crypto.randomUUID()}`;
  const created = await scenes.createSceneRecord({ id: sceneId, scene: graph, actor: 'admin', now });
  assert.equal(created.server_revision, 1);

  const lockedDraft = await scenes.lockScene(sceneId);
  const revisionNumber = await scenes.nextSceneRevisionNumber(sceneId);
  const revision = await scenes.createSceneRevision({
    id: `scene-revision-${crypto.randomUUID()}`,
    sceneId,
    revisionNumber,
    scene: lockedDraft,
    actor: 'admin',
    now
  });
  assert.equal(revision.revision_number, 1);

  const edited = structuredClone(graph);
  edited.name = 'E2E Scene edited after publish';
  edited.slides[0].elements[0].content = 'Изменённый Draft';
  const savedDraft = await scenes.updateSceneRecord(sceneId, edited, 1, 'admin', new Date().toISOString());
  assert.equal(savedDraft.server_revision, 2);
  assert.equal((await scenes.getSceneRevision(revision.id)).scene.slides[0].elements[0].content, 'Меню', 'published revision remains immutable after Draft edit');

  const assignment = await scenes.assignScreenSceneRevision(screenId, revision.id, 'admin', new Date().toISOString());
  assert.equal(assignment.scene_revision_id, revision.id);

  const store = {
    ...scenes,
    ...screens,
    async getScreenAnimationSettings() { return null; },
    async listProducts() { return listProducts(); },
    async listProductsByIds() { return []; },
    async listPackagingByIds() { return []; }
  };
  const state = await buildPlayerState(store, { screen_id: screenId }, config);
  const context = fullPlayerContext(state);

  assert.equal(context.scene.revision_id, revision.id);
  assert.equal(context.scene.graph.name, 'E2E Scene');
  assert.equal(context.scene.graph.slides[0].elements[0].content, 'Меню');
  assert.equal(context.scene.catalog_products[0].name, 'IPA E2E');

  const known = { schema_version: state.schema_version, hashes: { ...state.hashes, scene: 'old-scene-hash-12345678901234567890' } };
  const delta = deltaPlayerContext(state, known);
  assert.deepEqual(Object.keys(delta.changed), ['scene']);
  assert.equal(delta.changed.scene.revision_id, revision.id);

  await scenes.clearScreenSceneAssignment(screenId);
  const legacyState = await buildPlayerState(store, { screen_id: screenId }, config);
  const legacyContext = fullPlayerContext(legacyState);
  assert.equal(legacyContext.scene, null, 'removing assignment returns Player Context to legacy mode');
});
