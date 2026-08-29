import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import { createPublishService } from '../src/services/publish-service.js';

const config = { imageMaxPixels: 40_000_000 };

async function jpegFor(width, height) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 16, g: 24, b: 40 } }
  }).jpeg({ quality: 80 }).toBuffer();
}

function transactionalStore(methods) {
  const store = { ...methods };
  store.transaction = async (run) => run(store);
  if (!store.lockScreen) store.lockScreen = async () => true;
  return store;
}

test('staged JPEG is bound to the exact current draft revision under a screen lock', async () => {
  const bytes = await jpegFor(1920, 1080);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  let savedRevision = null;
  let locks = 0;
  const removed = [];
  const current = { id: 7, resolution: '1920×1080', publication_pending_sha256: null, prepared_asset_key: '7-old.jpg' };
  const store = transactionalStore({
    async getScreen() { return current; },
    async getScreenDraft() { return { revision: 12 }; },
    async lockScreen() { locks += 1; return true; },
    async savePreparedAsset(_id, asset, revision) {
      savedRevision = revision;
      return { ...current, status: 'ready', prepared_asset_key: asset.key, prepared_asset_sha256: asset.sha256, prepared_draft_revision: revision };
    }
  });
  const sftp = {
    async stageJpeg() { return { key: '7-new.jpg', sha256, size: bytes.length }; },
    async removeStaged(key) { removed.push(key); return true; }
  };
  const service = createPublishService({ store, sftp, config });
  const screen = await service.stageJpeg(7, bytes);
  assert.equal(savedRevision, 12);
  assert.equal(screen.prepared_draft_revision, 12);
  assert.equal(locks, 1);
  assert.deepEqual(removed, ['7-old.jpg']);
});

test('staging race removes the new orphan when draft changed before locked DB commit', async () => {
  const bytes = await jpegFor(1920, 1080);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const removed = [];
  let draftReads = 0;
  const store = transactionalStore({
    async getScreen() { return { id: 8, resolution: '1920×1080', publication_pending_sha256: null, prepared_asset_key: null }; },
    async getScreenDraft() { draftReads += 1; return { revision: draftReads === 1 ? 3 : 4 }; },
    async savePreparedAsset() { throw new Error('must not save stale asset'); }
  });
  const sftp = {
    async stageJpeg() { return { key: '8-race.jpg', sha256, size: bytes.length }; },
    async removeStaged(key) { removed.push(key); return true; }
  };
  const service = createPublishService({ store, sftp, config });
  await assert.rejects(() => service.stageJpeg(8, bytes), /Меню изменилось/);
  assert.deepEqual(removed, ['8-race.jpg']);
});

test('publication starts only when prepared JPEG revision still equals locked draft revision', async () => {
  const current = {
    id: 10,
    sftp_directory_name: 'point-10',
    delivery_filename: 'monitor-10.jpg',
    prepared_asset_key: '10-stage.jpg',
    prepared_asset_sha256: 'sha10',
    prepared_draft_revision: 7,
    publication_pending_sha256: null
  };
  let started = 0;
  const store = transactionalStore({
    async getScreen() { return current; },
    async getScreenDraft() { return { revision: 8 }; },
    async markPublicationStarted() { started += 1; return current; }
  });
  const sftp = { async publishedInfo() { return null; } };
  const service = createPublishService({ store, sftp, config });
  await assert.rejects(() => service.publish(10), /предыдущей версии меню/);
  assert.equal(started, 0);
});

test('pending publication is recovered by target SHA without rewriting the file', async () => {
  const pending = {
    id: 9,
    sftp_directory_name: 'point-9',
    delivery_filename: 'monitor-9.jpg',
    prepared_asset_key: '9-stage.jpg',
    publication_pending_sha256: 'abc123'
  };
  let publishCalls = 0;
  let marked = 0;
  const removed = [];
  const store = transactionalStore({
    async getScreen() { return pending; },
    async markScreenPublished(id, sha) {
      assert.equal(id, 9);
      assert.equal(sha, 'abc123');
      marked += 1;
      return { ...pending, status: 'published', prepared_asset_key: null, publication_pending_sha256: null };
    }
  });
  const sftp = {
    async publishedInfo() { return { sha256: 'abc123', size: 100 }; },
    async publish() { publishCalls += 1; },
    async removeStaged(key) { removed.push(key); }
  };
  const service = createPublishService({ store, sftp, config });
  const result = await service.publish(9);
  assert.equal(result.status, 'published');
  assert.equal(marked, 1);
  assert.equal(publishCalls, 0);
  assert.deepEqual(removed, ['9-stage.jpg']);
});
