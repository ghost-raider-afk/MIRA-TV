export async function migrateWebSessions(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS web_sessions (
      token_hash TEXT PRIMARY KEY,
      username TEXT NOT NULL REFERENCES web_users(username) ON DELETE CASCADE,
      session_version INTEGER NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS web_sessions_username_index ON web_sessions(username);
    CREATE INDEX IF NOT EXISTS web_sessions_expires_at_index ON web_sessions(expires_at);
  `);
}
