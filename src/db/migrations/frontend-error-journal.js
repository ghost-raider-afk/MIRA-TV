export async function migrateFrontendErrorJournal(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS frontend_error_events (
      id BIGSERIAL PRIMARY KEY,
      error_type TEXT NOT NULL,
      message TEXT NOT NULL,
      stack TEXT NOT NULL DEFAULT '',
      page TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      line_number INTEGER,
      column_number INTEGER,
      user_agent TEXT NOT NULL DEFAULT '',
      username TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS frontend_error_events_created_at_index
      ON frontend_error_events(created_at DESC, id DESC);
  `);
}
