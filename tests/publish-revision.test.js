import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublishService } from '../src/services/publish-service.js';

test('publish accepts PostgreSQL BIGINT prepared revision returned as a string', async () => {
  let screen = {
    id: 3,
    sftp_directory_name: 'point-3',
    delivery_filename: 'monitor-3.jpg',
    publication_pending_sha256: null,
    prepared_asset_key: 'stage-3.jpg',
    prepared_asset_sha256: 'abc123',
    prepared_asset_size: 1024,
    prepared_draft_revision: '12',
    status: 'ready'
  };

  const tx = {
    async lockScreen() { return true; },
    async getScreen() { return { ...screen }; },
    async getScreenDraft() { return { screen_id: 3, revision: 12, rows: [], settings: {} }; },
    async markPublicationStarted(_id, sha256, revision) {
      assert.equal(sha256, 'abc123');
      assert.equal(revision, 12);
      screen = { ...screen, publication_pending_sha256: sha256 };
      return { ...screen };
    },
    async markScreenPublished(_id, sha256) {
      assert.equal(sha256, 'abc123');
      screen = {
        ...screen,
        status: 'published',
        published_sha256: sha256,
        published_draft_revision: 12,
        publication_pending_sha256: null,
        prepared_asset_key: null,
        prepared_asset_sha256: null,
        prepared_asset_size: null,
        prepared_draft_revision: null
      };
      return { ...screen };
    }
  };

  const store = {
    async getScreen() { return { ...screen }; },
    async transaction(callback) { return callback(tx); },
    async clearPublicationPending() { screen = { ...screen, publication_pending_sha256: null }; }
  };

  let published = false;
  const sftp = {
    async publish({ directoryName, deliveryFilename, stagedKey, expectedSha256 }) {
      assert.equal(directoryName, 'point-3');
      assert.equal(deliveryFilename, 'monitor-3.jpg');
      assert.equal(stagedKey, 'stage-3.jpg');
      assert.equal(expectedSha256, 'abc123');
      published = true;
      return { sha256: expectedSha256, size: 1024 };
    },
    async removeStaged(key) { assert.equal(key, 'stage-3.jpg'); },
    async publishedInfo() { return null; }
  };

  const service = createPublishService({ store, sftp, config: { imageMaxPixels: 40_000_000 } });
  const result = await service.publish(3);

  assert.equal(published, true);
  assert.equal(result.status, 'published');
  assert.equal(result.published_draft_revision, 12);
});
