import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { sceneMediaAssetIds, scenePayloadInput } from '../src/contracts/scene.js';
import { initialiseSchema } from '../src/db/migrations/schema.js';
import { migratePrototypeScenes } from '../src/db/migrations/prototype-scenes.js';
import { migrateScenePublishing } from '../src/db/migrations/scene-publishing.js';
import { migrateMediaAssets } from '../src/db/migrations/media-assets.js';
import { createScenesRepository } from '../src/db/scenes.js';
import { createMediaAssetsRepository } from '../src/db/media-assets.js';
import { buildPlayerState, fullPlayerContext } from '../src/services/player-context-service.js';

const IMAGE_ID = 'media-11111111-1111-4111-8111-111111111111';
const VIDEO_ID = 'media-22222222-2222-4222-8222-222222222222';

function graph({ imageId = IMAGE_ID, videoId = VIDEO_ID } = {}) {
  return {
    schema_version: 1,
    name: 'Медиа сцена',
    display_count: 1,
    active_slide_id: 'slide-1',
    slides: [{
      id: 'slide-1',
      name: 'Слайд 1',
      duration_ms: 10000,
      transition: 'fade',
      background: { type: 'video', color: '#10141c', asset_id: videoId },
      elements: [{
        id: 'element-image',
        type: 'image',
        asset_id: imageId,
        x: 100,
        y: 100,
        width: 600,
        height: 400,
        z_index: 1,
        opacity: 1,
        content: 'Фото',
        variant: 'default',
        style: { color: '#ffffff', font_size: 40, background: 'transparent', radius: 0 },
        effects: { shadow: false, glow: false, blur: 0 },
        animation: { entrance: 'none', loop: 'none', exit: 'none', duration_ms: 600 }
      }]
    }]
  };
}

function mediaRecord(id, kind, filename) {
  return {
    id,
    originalName: filename,
    kind,
    mimeType: kind === 'video' ? 'video/mp4' : 'image/png',
    filename,
    sizeBytes: 1024,
    width: 1920,
    height: 1080,
    hasAlpha: kind === 'image',
    actor: 'admin',
    now: '2026-08-29T12:00:00.000Z'
  };
}

test('scene contract preserves media asset ids and derives one unique dependency set', () => {
  const scene = scenePayloadInput(graph());
  assert.equal(scene.slides[0].background.asset_id, VIDEO_ID);
  assert.equal(scene.slides[0].elements[0].asset_id, IMAGE_ID);
  assert.deepEqual(sceneMediaAssetIds(scene).sort(), [IMAGE_ID, VIDEO_ID].sort());
  assert.throws(
    () => scenePayloadInput(graph({ imageId: '/site-assets/media/injected.png' })),
    /идентификатор медиафайла/
  );
});

test('PostgreSQL references prevent deleting media used by Draft or immutable Published Revision', async () => {
  const memoryDb = newDb({ autoCreateForeignKeyIndices: true });
  const { Pool } = memoryDb.adapters.createPg();
  const pool = new Pool();
  try {
    await initialiseSchema(pool);
    await migratePrototypeScenes(pool);
    await migrateScenePublishing(pool);
    await migrateMediaAssets(pool);
    const scenes = createScenesRepository(pool);
    const media = createMediaAssetsRepository(pool);

    await media.createMediaAsset(mediaRecord(IMAGE_ID, 'image', 'media-11111111-1111-4111-8111-111111111111.png'));
    await media.createMediaAsset(mediaRecord(VIDEO_ID, 'video', 'media-22222222-2222-4222-8222-222222222222.mp4'));

    const scene = scenePayloadInput(graph());
    await scenes.createSceneRecord({ id: 'scene-media', scene, actor: 'admin', now: '2026-08-29T12:00:00.000Z' });
    await media.replaceSceneDraftMediaRefs('scene-media', sceneMediaAssetIds(scene));
    assert.equal(await media.isMediaAssetReferenced(IMAGE_ID), true);
    await assert.rejects(() => media.deleteMediaAssetRecord(IMAGE_ID));

    const revision = await scenes.createSceneRevision({
      id: 'scene-revision-media',
      sceneId: 'scene-media',
      revisionNumber: 1,
      scene,
      actor: 'admin',
      now: '2026-08-29T12:01:00.000Z'
    });
    await media.replaceSceneRevisionMediaRefs(revision.id, sceneMediaAssetIds(scene));
    await media.replaceSceneDraftMediaRefs('scene-media', []);
    assert.equal(await media.isMediaAssetReferenced(IMAGE_ID), true, 'published revision keeps the asset protected after Draft stops using it');
    await assert.rejects(() => media.deleteMediaAssetRecord(IMAGE_ID));

    await scenes.deleteSceneRecord('scene-media');
    assert.equal(await media.isMediaAssetReferenced(IMAGE_ID), false);
    assert.equal((await media.deleteMediaAssetRecord(IMAGE_ID)).id, IMAGE_ID);
  } finally {
    await pool.end();
  }
});

test('Player Context resolves only media referenced by the assigned Published Scene', async () => {
  const scene = scenePayloadInput(graph());
  const calls = [];
  const store = {
    async getScreen(id) { return { id, name: 'TV 1', resolution: '1920×1080', status: 'ready', active: true, location_id: 1, location_name: 'Бар', location_number: 1 }; },
    async getScreenDraft() { return { rows: [], settings: {}, revision: 1 }; },
    async getScreenAnimationSettings() { return null; },
    async getScreenSceneAssignment() { return { scene_revision_id: 'scene-revision-media' }; },
    async getSceneRevision() { return { id: 'scene-revision-media', scene_id: 'scene-media', scene_name: 'Медиа сцена', revision_number: 1, published_at: '2026-08-29T12:00:00.000Z', scene }; },
    async listMediaAssetsByIds(ids) { calls.push([...ids]); return ids.map((id) => ({ id, kind: id === VIDEO_ID ? 'video' : 'image', url: `/site-assets/media/${id}` })); },
    async listProducts() { return []; },
    async listProductsByIds() { return []; },
    async listPackagingByIds() { return []; }
  };
  const config = { playerFallbackPollSeconds: 60, playerLogBatchSize: 100, playerLogLocalMaxEntries: 5000, playerLogLocalMaxBytes: 10485760 };
  const context = fullPlayerContext(await buildPlayerState(store, { screen_id: 7 }, config));
  assert.deepEqual(calls[0].sort(), [IMAGE_ID, VIDEO_ID].sort());
  assert.equal(context.scene.media_assets.length, 2);
  assert.equal(context.scene.graph.slides[0].elements[0].asset_id, IMAGE_ID);
});
