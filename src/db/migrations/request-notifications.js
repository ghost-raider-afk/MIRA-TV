// Personal request inbox; the activity audit and proposal history remain unchanged.
export async function migrateRequestNotifications(db) {
  await db.query(`
    ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS request_sound_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE TABLE IF NOT EXISTS request_notifications (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL REFERENCES web_users(username) ON DELETE CASCADE,
      proposal_id BIGINT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('created','resubmitted','approved','rework','rejected','conflict')),
      title TEXT NOT NULL,
      location_name TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read_at TIMESTAMPTZ,
      presented_at TIMESTAMPTZ,
      archived_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS request_notifications_user_idx
      ON request_notifications(username,id DESC) WHERE archived_at IS NULL;
    CREATE INDEX IF NOT EXISTS request_notifications_pending_idx
      ON request_notifications(username,id DESC)
      WHERE archived_at IS NULL AND presented_at IS NULL;
    CREATE OR REPLACE FUNCTION mira_request_notification_trigger()
    RETURNS trigger LANGUAGE plpgsql AS $body$
    DECLARE event_kind TEXT; request_title TEXT; location_label TEXT; recipient RECORD;
    BEGIN
      IF TG_OP='INSERT' THEN
        event_kind:='created';
      ELSIF OLD.status=NEW.status THEN
        RETURN NEW;
      ELSIF OLD.status='rework' AND NEW.status='pending' THEN
        event_kind:='resubmitted';
      ELSIF NEW.status IN ('approved','resolved') THEN
        event_kind:='approved';
      ELSIF NEW.status IN ('rework','rejected','conflict') THEN
        event_kind:=NEW.status;
      ELSE
        RETURN NEW;
      END IF;
      request_title:=COALESCE(NULLIF(NEW.title,''), CASE COALESCE(NEW.request_type,NEW.entity_type)
        WHEN 'price_change' THEN 'Изменение цены'
        WHEN 'property_change' THEN 'Изменение свойств товара'
        WHEN 'menu_add' THEN 'Добавление позиций в меню'
        WHEN 'menu_remove' THEN 'Удаление позиций из меню'
        WHEN 'product_create' THEN 'Добавление товара'
        WHEN 'product' THEN 'Изменение товара'
        WHEN 'packaging' THEN 'Изменение тары'
        ELSE 'Обращение'
      END);
      location_label:=COALESCE(
        (SELECT name FROM locations WHERE id=NEW.location_id),
        NEW.items_json->0->>'location_name','');
      IF event_kind IN ('created','resubmitted') THEN
        FOR recipient IN SELECT username FROM web_users WHERE role='administrator' AND active=TRUE LOOP
          INSERT INTO request_notifications(username,proposal_id,kind,title,location_name)
          VALUES(recipient.username,NEW.id,event_kind,request_title,location_label);
          PERFORM pg_notify('mira_request_notifications',recipient.username);
        END LOOP;
      ELSIF EXISTS(SELECT 1 FROM web_users WHERE username=NEW.manager_username AND role='manager' AND active=TRUE) THEN
        INSERT INTO request_notifications(username,proposal_id,kind,title,location_name)
        VALUES(NEW.manager_username,NEW.id,event_kind,request_title,location_label);
        PERFORM pg_notify('mira_request_notifications',NEW.manager_username);
      END IF;
      RETURN NEW;
    END $body$;
    DROP TRIGGER IF EXISTS mira_request_notifications_after_change ON catalog_change_proposals;
    CREATE TRIGGER mira_request_notifications_after_change
      AFTER INSERT OR UPDATE OF status ON catalog_change_proposals
      FOR EACH ROW EXECUTE FUNCTION mira_request_notification_trigger();
  `);
}
