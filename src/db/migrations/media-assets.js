export async function migrateMediaAssets(queryable) {
  await queryable.query(`
    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      original_name TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL CHECK(kind IN ('image', 'video')),
      mime_type TEXT NOT NULL,
      filename TEXT NOT NULL UNIQUE,
      size_bytes BIGINT NOT NULL CHECK(size_bytes > 0),
      width INTEGER NOT NULL CHECK(width > 0),
      height INTEGER NOT NULL CHECK(height > 0),
      has_alpha BOOLEAN NOT NULL DEFAULT FALSE,
      created_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scene_draft_media_assets (
      scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
      asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
      PRIMARY KEY(scene_id, asset_id)
    );

    CREATE TABLE IF NOT EXISTS scene_revision_media_assets (
      scene_revision_id TEXT NOT NULL REFERENCES scene_revisions(id) ON DELETE CASCADE,
      asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
      PRIMARY KEY(scene_revision_id, asset_id)
    );

    CREATE INDEX IF NOT EXISTS media_assets_created_at_index ON media_assets(created_at DESC, id);
    CREATE INDEX IF NOT EXISTS scene_draft_media_assets_asset_index ON scene_draft_media_assets(asset_id);
    CREATE INDEX IF NOT EXISTS scene_revision_media_assets_asset_index ON scene_revision_media_assets(asset_id);
  `);
}
