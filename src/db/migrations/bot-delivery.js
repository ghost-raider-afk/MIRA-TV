// 043: server-side durable delivery. New bot never gets DB credentials or joins the DB network.
export async function migrateBotDelivery(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS bot_notification_cursor (
      id SMALLINT PRIMARY KEY CHECK (id=1),
      last_notification_id BIGINT NOT NULL DEFAULT 0
    );
    INSERT INTO bot_notification_cursor (id,last_notification_id)
    SELECT 1,COALESCE(MAX(id),0) FROM request_notifications
    ON CONFLICT (id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS bot_screen_connection_state (
      screen_id BIGINT PRIMARY KEY REFERENCES screens(id) ON DELETE CASCADE,
      last_state TEXT NOT NULL CHECK(last_state IN ('online','offline')),
      offline_since TIMESTAMPTZ,
      notified BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS bot_outbox (
      id BIGSERIAL PRIMARY KEY,
      event_key TEXT NOT NULL,
      username TEXT NOT NULL REFERENCES web_users(username) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK(provider IN ('telegram','max')),
      kind TEXT NOT NULL CHECK(kind IN ('tv_offline','tv_restored','request_new')),
      location_name TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      attempts INTEGER NOT NULL DEFAULT 0,
      lease_token TEXT,
      lease_expires_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      UNIQUE(event_key,username,provider)
    );
    CREATE INDEX IF NOT EXISTS bot_outbox_pending_idx
      ON bot_outbox(available_at,id) WHERE delivered_at IS NULL;
  `);
}
