// Extend the existing proposal journal instead of creating an independent ticket storage.
export async function migrateManagerCrmCards(queryable) {
  await queryable.query(`
    ALTER TABLE catalog_change_proposals
      ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS location_id BIGINT REFERENCES locations(id) ON DELETE SET NULL;
    ALTER TABLE catalog_change_proposals ALTER COLUMN entity_id DROP NOT NULL;
    ALTER TABLE catalog_change_proposals ALTER COLUMN base_updated_at DROP NOT NULL;
    ALTER TABLE catalog_change_proposals DROP CONSTRAINT IF EXISTS catalog_change_proposals_entity_type_check;
    ALTER TABLE catalog_change_proposals ADD CONSTRAINT catalog_change_proposals_entity_type_check
      CHECK (entity_type IN ('product','packaging','message'));
    ALTER TABLE catalog_change_proposals DROP CONSTRAINT IF EXISTS catalog_change_proposals_entity_id_check;
    ALTER TABLE catalog_change_proposals ADD CONSTRAINT catalog_change_proposals_entity_id_check
      CHECK ((entity_type = 'message' AND entity_id IS NULL)
             OR (entity_type IN ('product','packaging') AND entity_id > 0));
    ALTER TABLE catalog_change_proposals DROP CONSTRAINT IF EXISTS catalog_change_proposals_status_check;
    ALTER TABLE catalog_change_proposals ADD CONSTRAINT catalog_change_proposals_status_check
      CHECK (status IN ('pending','approved','rejected','conflict','resolved'));
    CREATE INDEX IF NOT EXISTS catalog_change_proposals_location_idx
      ON catalog_change_proposals(location_id, created_at DESC);
  `);
}
