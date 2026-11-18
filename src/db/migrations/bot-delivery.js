// 043: server-side durable delivery. New bot never gets DB credentials or joins the DB network.
export async function migrateBotDelivery(db) {
  await db.query(`
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
      kind TEXT NOT NULL CHECK(kind IN ('tv_offline','tv_restored','request_new','request_updated')),
      location_id BIGINT REFERENCES locations(id) ON DELETE SET NULL,
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

    -- CRM and the durable outbox commit atomically. A polling cursor could
    -- skip lower IDs from concurrent transactions that commit out of order.
    CREATE OR REPLACE FUNCTION mira_bot_request_outbox_trigger()
    RETURNS trigger LANGUAGE plpgsql AS $bot$
    BEGIN
      INSERT INTO bot_outbox(event_key,username,provider,kind,location_name,subject,detail)
      SELECT 'crm:' || NEW.id::text,NEW.username,a.provider,
        CASE WHEN NEW.kind IN ('created','resubmitted') THEN 'request_new' ELSE 'request_updated' END,
        LEFT(NEW.location_name,100),
        'Заявка №' || NEW.proposal_id::text,
        LEFT((CASE NEW.kind
          WHEN 'created' THEN 'Создана'
          WHEN 'resubmitted' THEN 'Отправлена повторно'
          WHEN 'approved' THEN 'Завершена'
          WHEN 'rework' THEN 'На доработке'
          WHEN 'rejected' THEN 'Отклонена'
          WHEN 'conflict' THEN 'Ошибка'
          ELSE 'Обновлена' END) || ': ' || NEW.title,180)
        FROM messenger_accounts a
        JOIN web_users u ON u.username=a.username AND u.active=TRUE
       WHERE a.username=NEW.username
      ON CONFLICT(event_key,username,provider) DO NOTHING;
      RETURN NEW;
    END $bot$;
    DROP TRIGGER IF EXISTS mira_bot_request_notification_outbox ON request_notifications;
    CREATE TRIGGER mira_bot_request_notification_outbox
      AFTER INSERT ON request_notifications
      FOR EACH ROW EXECUTE FUNCTION mira_bot_request_outbox_trigger();
  `);
}
