import assert from 'node:assert/strict';
import test from 'node:test';
import { normaliseRow } from '../src/db/helpers.js';

test('PostgreSQL BIGINT screen revisions are normalized to numbers at the repository boundary', () => {
  const screen = normaliseRow({
    id: '3',
    location_id: '2',
    prepared_asset_size: '184320',
    prepared_draft_revision: '12',
    published_draft_revision: '11'
  });

  assert.equal(screen.id, 3);
  assert.equal(screen.location_id, 2);
  assert.equal(screen.prepared_asset_size, 184320);
  assert.equal(screen.prepared_draft_revision, 12);
  assert.equal(screen.published_draft_revision, 11);
  assert.equal(typeof screen.prepared_draft_revision, 'number');
});

test('nullable BIGINT revision fields remain null', () => {
  const screen = normaliseRow({ id: '3', prepared_draft_revision: null, published_draft_revision: null });
  assert.equal(screen.prepared_draft_revision, null);
  assert.equal(screen.published_draft_revision, null);
});
