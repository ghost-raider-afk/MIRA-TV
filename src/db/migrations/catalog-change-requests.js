export async function migrateCatalogChangeRequests(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_change_requests (
      id BIGSERIAL PRIMARY KEY,
      requester_username TEXT NOT NULL,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('product', 'packaging')),
      entity_id BIGINT,
      operation TEXT NOT NULL DEFAULT 'update' CHECK(operation IN ('create', 'update', 'delete')),
      before_json TEXT NOT NULL DEFAULT '{}',
      proposed_json TEXT NOT NULL DEFAULT '{}',
      base_updated_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'conflict')),
      reviewer_username TEXT NOT NULL DEFAULT '',
      review_comment TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      reviewed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS catalog_change_requests_status_created_index
      ON catalog_change_requests(status, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS catalog_change_requests_requester_created_index
      ON catalog_change_requests(requester_username, created_at DESC, id DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS catalog_change_requests_pending_unique
      ON catalog_change_requests(requester_username, entity_type, entity_id, operation)
      WHERE status = 'pending' AND entity_id IS NOT NULL;
  `);
}
