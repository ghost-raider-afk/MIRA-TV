export async function migrateCatalogViews(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_views (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS catalog_view_items (
      view_id BIGINT NOT NULL REFERENCES catalog_views(id) ON DELETE CASCADE,
      item_id BIGINT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order >= 0),
      PRIMARY KEY (view_id, item_id)
    );

    CREATE INDEX IF NOT EXISTS catalog_views_active_name_index ON catalog_views(active, name);
    CREATE INDEX IF NOT EXISTS catalog_view_items_order_index ON catalog_view_items(view_id, sort_order, item_id);
    CREATE INDEX IF NOT EXISTS catalog_view_items_item_index ON catalog_view_items(item_id, view_id);
  `);
}
