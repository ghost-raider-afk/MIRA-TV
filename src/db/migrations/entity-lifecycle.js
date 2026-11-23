// Lifecycle is non-destructive: existing IDs, Player drafts, assets and device bindings survive trash/restore.
export async function migrateEntityLifecycle(queryable) {
  await queryable.query(`
    ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS deleted_by TEXT;
    ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
    ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS archived_by TEXT;
    ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS active_before_archive BOOLEAN;
    ALTER TABLE screens ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE screens ADD COLUMN IF NOT EXISTS deleted_by TEXT;
    ALTER TABLE locations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE locations ADD COLUMN IF NOT EXISTS deleted_by TEXT;

    CREATE TABLE IF NOT EXISTS catalog_product_history (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT NOT NULL REFERENCES catalog_products(id),
      action TEXT NOT NULL,
      actor_username TEXT NOT NULL,
      changes JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS catalog_product_history_product_idx
      ON catalog_product_history (product_id, id DESC);

    -- A legacy creation date is known; the earlier field changes and actor are not.
    INSERT INTO catalog_product_history (product_id, action, actor_username, changes, occurred_at)
    SELECT id, 'legacy', 'неизвестен',
           '{}'::jsonb,
           created_at
      FROM catalog_products p
     WHERE NOT EXISTS (SELECT 1 FROM catalog_product_history h WHERE h.product_id = p.id);

    CREATE OR REPLACE FUNCTION mira_catalog_product_history_trigger()
    RETURNS trigger LANGUAGE plpgsql AS $history$
    DECLARE
      field_name TEXT;
      old_json JSONB;
      new_json JSONB;
      diff JSONB := '{}'::jsonb;
      action_name TEXT := 'updated';
      actor TEXT := COALESCE(NULLIF(current_setting('mira.actor_username', TRUE), ''), 'система');
    BEGIN
      IF TG_OP = 'INSERT' THEN
        -- A new product gets its full initial snapshot, not only its name.
        SELECT COALESCE(jsonb_object_agg(attrs.key,
          jsonb_build_object('before', NULL, 'after', attrs.value)), '{}'::jsonb)
          INTO diff
          FROM jsonb_each(to_jsonb(NEW)) AS attrs(key, value)
         WHERE attrs.key = ANY (ARRAY[
           'name', 'producer', 'address', 'characteristics', 'strength',
           'price_primary', 'price_secondary', 'alcoholic',
           'beverage_color', 'filtration', 'active'
         ]);
        INSERT INTO catalog_product_history (product_id, action, actor_username, changes, occurred_at)
        VALUES (NEW.id, 'created', actor, diff, NEW.created_at);
        RETURN NEW;
      END IF;

      old_json := to_jsonb(OLD);
      new_json := to_jsonb(NEW);
      FOREACH field_name IN ARRAY ARRAY[
        'name', 'producer', 'address', 'characteristics', 'strength',
        'price_primary', 'price_secondary', 'alcoholic', 'beverage_color',
        'filtration', 'active', 'archived_at', 'deleted_at'
      ] LOOP
        IF old_json -> field_name IS DISTINCT FROM new_json -> field_name THEN
          diff := diff || jsonb_build_object(field_name,
            jsonb_build_object('before', old_json -> field_name, 'after', new_json -> field_name));
        END IF;
      END LOOP;
      IF diff = '{}'::jsonb THEN RETURN NEW; END IF;

      IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        action_name := 'deleted';
        actor := COALESCE(NULLIF(current_setting('mira.actor_username', TRUE), ''), NEW.deleted_by, 'система');
      ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
        action_name := 'restored';
      ELSIF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
        action_name := 'archived';
        actor := COALESCE(NULLIF(current_setting('mira.actor_username', TRUE), ''), NEW.archived_by, 'система');
      ELSIF OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN
        action_name := 'unarchived';
      END IF;

      INSERT INTO catalog_product_history (product_id, action, actor_username, changes, occurred_at)
      VALUES (NEW.id, action_name, actor, diff, NOW());
      RETURN NEW;
    END
    $history$;
    DROP TRIGGER IF EXISTS mira_catalog_product_history ON catalog_products;
    CREATE TRIGGER mira_catalog_product_history
      AFTER INSERT OR UPDATE ON catalog_products
      FOR EACH ROW EXECUTE FUNCTION mira_catalog_product_history_trigger();
  `);
}
