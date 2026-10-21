// Extend the historical CRM journal in place. Never rewrite old proposal rows.
export async function migrateCrmRequestWorkflow(queryable) {
  await queryable.query(`
    ALTER TABLE catalog_change_proposals
      ADD COLUMN IF NOT EXISTS request_type TEXT,
      ADD COLUMN IF NOT EXISTS items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS catalog_product_id BIGINT REFERENCES catalog_products(id) ON DELETE SET NULL;
    UPDATE catalog_change_proposals
      SET status_changed_at=COALESCE(decided_at,created_at)
      WHERE status_changed_at IS NULL;
    ALTER TABLE catalog_change_proposals ALTER COLUMN status_changed_at SET DEFAULT NOW();
    ALTER TABLE catalog_change_proposals ALTER COLUMN status_changed_at SET NOT NULL;
    ALTER TABLE catalog_change_proposals DROP CONSTRAINT IF EXISTS catalog_change_proposals_entity_type_check;
    ALTER TABLE catalog_change_proposals ADD CONSTRAINT catalog_change_proposals_entity_type_check
      CHECK (entity_type IN ('product','packaging','message','request'));
    ALTER TABLE catalog_change_proposals DROP CONSTRAINT IF EXISTS catalog_change_proposals_entity_id_check;
    ALTER TABLE catalog_change_proposals ADD CONSTRAINT catalog_change_proposals_entity_id_check
      CHECK ((entity_type IN ('message','request') AND entity_id IS NULL)
             OR (entity_type IN ('product','packaging') AND entity_id > 0));
    ALTER TABLE catalog_change_proposals DROP CONSTRAINT IF EXISTS catalog_change_proposals_status_check;
    ALTER TABLE catalog_change_proposals ADD CONSTRAINT catalog_change_proposals_status_check
      CHECK (status IN ('pending','rework','approved','rejected','conflict','resolved'));
    CREATE TABLE IF NOT EXISTS catalog_proposal_events (
      id BIGSERIAL PRIMARY KEY,
      proposal_id BIGINT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS catalog_proposal_events_proposal_idx
      ON catalog_proposal_events(proposal_id,created_at,id);
  `);
}
