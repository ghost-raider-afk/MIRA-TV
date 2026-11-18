// Reserved as migration 042; TV diagnostics use 041 in PR #156.
export async function migrateMessengerLinks(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS messenger_link_codes (
      username TEXT NOT NULL REFERENCES web_users(username) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK(provider IN ('telegram','max')),
      code_hash CHAR(64) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      PRIMARY KEY(username,provider)
    );
    CREATE TABLE IF NOT EXISTS messenger_accounts (
      username TEXT NOT NULL REFERENCES web_users(username) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK(provider IN ('telegram','max')),
      provider_user_id TEXT NOT NULL CHECK(provider_user_id ~ '^[1-9][0-9]{0,18}$'),
      linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(username,provider),
      UNIQUE(provider,provider_user_id)
    );
  `);
}
