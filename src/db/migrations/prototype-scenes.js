export async function migratePrototypeScenes(queryable) {
  await queryable.query(`
    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      schema_version INTEGER NOT NULL DEFAULT 1,
      scene_json JSONB NOT NULL,
      revision BIGINT NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS scenes_updated_at_index ON scenes(updated_at DESC);
  `);
}
