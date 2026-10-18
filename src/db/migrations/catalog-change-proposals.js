export async function migrateCatalogChangeProposals(queryable) {
  await queryable.query(`
    CREATE TABLE IF NOT EXISTS catalog_change_proposals (
      id BIGSERIAL PRIMARY KEY,
      manager_username TEXT NOT NULL,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('product','packaging')),
      entity_id BIGINT NOT NULL CHECK (entity_id > 0),
      base_updated_at TIMESTAMPTZ NOT NULL,
      base_payload JSONB NOT NULL,
      proposed_payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','conflict')),
      reviewer_username TEXT,
      review_comment TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      decided_at TIMESTAMPTZ
    );
  `);
  await queryable.query('CREATE INDEX IF NOT EXISTS catalog_change_proposals_manager_idx ON catalog_change_proposals (manager_username, created_at DESC);');
  await queryable.query('CREATE INDEX IF NOT EXISTS catalog_change_proposals_status_idx ON catalog_change_proposals (status, created_at ASC);');
}
