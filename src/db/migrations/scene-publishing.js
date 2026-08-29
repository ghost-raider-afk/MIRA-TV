export async function migrateScenePublishing(queryable) {
  await queryable.query(`
    CREATE TABLE IF NOT EXISTS scene_revisions (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
      revision_number INTEGER NOT NULL,
      schema_version INTEGER NOT NULL,
      scene_json JSONB NOT NULL,
      published_by TEXT NOT NULL DEFAULT '',
      published_at TIMESTAMPTZ NOT NULL,
      UNIQUE(scene_id, revision_number)
    );

    CREATE TABLE IF NOT EXISTS screen_scene_assignments (
      screen_id BIGINT PRIMARY KEY REFERENCES screens(id) ON DELETE CASCADE,
      scene_revision_id TEXT NOT NULL REFERENCES scene_revisions(id) ON DELETE RESTRICT,
      assigned_by TEXT NOT NULL DEFAULT '',
      assigned_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS scene_revisions_scene_index
      ON scene_revisions(scene_id, revision_number DESC);
    CREATE INDEX IF NOT EXISTS screen_scene_assignments_revision_index
      ON screen_scene_assignments(scene_revision_id);
  `);
}
