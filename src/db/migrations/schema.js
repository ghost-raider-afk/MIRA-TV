import { isoNow } from '../helpers.js';

export async function initialiseSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sftp_directories (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      provisioned_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS locations (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      address TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      sftp_directory_id BIGINT UNIQUE REFERENCES sftp_directories(id) ON DELETE RESTRICT,
      sftp_username TEXT UNIQUE,
      sftp_password_issued_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS screens (
      id BIGSERIAL PRIMARY KEY,
      location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      location_number INTEGER,
      name TEXT NOT NULL,
      resolution TEXT NOT NULL DEFAULT '1920×1080',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'ready', 'published')),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      delivery_filename TEXT,
      prepared_asset_key TEXT,
      prepared_asset_sha256 TEXT,
      prepared_asset_size BIGINT,
      prepared_draft_revision BIGINT,
      publication_pending_sha256 TEXT,
      publication_started_at TIMESTAMPTZ,
      published_sha256 TEXT,
      published_draft_revision BIGINT,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      UNIQUE(location_id, name)
    );
    CREATE TABLE IF NOT EXISTS catalog_products (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      producer TEXT NOT NULL DEFAULT '',
      characteristics TEXT NOT NULL DEFAULT '',
      strength TEXT NOT NULL DEFAULT '',
      price_primary TEXT NOT NULL DEFAULT '',
      price_secondary TEXT NOT NULL DEFAULT '',
      alcoholic BOOLEAN NOT NULL DEFAULT FALSE,
      beverage_color TEXT NOT NULL DEFAULT 'none',
      filtration TEXT NOT NULL DEFAULT 'none',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS catalog_packaging (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      unit_price TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS screen_drafts (
      screen_id BIGINT PRIMARY KEY REFERENCES screens(id) ON DELETE CASCADE,
      rows_json TEXT NOT NULL DEFAULT '[]',
      settings_json TEXT NOT NULL DEFAULT '{}',
      revision BIGINT NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_preferences (
      username TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      job_title TEXT NOT NULL DEFAULT '',
      theme TEXT NOT NULL DEFAULT 'system',
      notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS web_users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'administrator' CHECK(role IN ('administrator')),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      session_version INTEGER NOT NULL DEFAULT 1,
      password_changed_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS site_settings (
      id SMALLINT PRIMARY KEY,
      application_name TEXT NOT NULL DEFAULT '',
      accent_color TEXT NOT NULL DEFAULT '#F4C915',
      logo_filename TEXT NOT NULL DEFAULT '',
      favicon_filename TEXT NOT NULL DEFAULT '',
      signin_logo_size SMALLINT NOT NULL DEFAULT 1 CHECK(signin_logo_size BETWEEN 1 AND 7),
      timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
      date_format TEXT NOT NULL DEFAULT 'DD.MM.YYYY',
      dashboard_refresh_seconds INTEGER NOT NULL DEFAULT 45,
      default_screen_resolution TEXT NOT NULL DEFAULT '1920×1080',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity_events (
      id BIGSERIAL PRIMARY KEY,
      actor_username TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      message TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL
    );
    ALTER TABLE locations ADD COLUMN IF NOT EXISTS sftp_directory_id BIGINT REFERENCES sftp_directories(id) ON DELETE RESTRICT;
    ALTER TABLE locations ADD COLUMN IF NOT EXISTS sftp_username TEXT;
    ALTER TABLE locations ADD COLUMN IF NOT EXISTS sftp_password_issued_at TIMESTAMPTZ;
    ALTER TABLE screens ADD COLUMN IF NOT EXISTS location_number INTEGER;
    ALTER TABLE screens ADD COLUMN IF NOT EXISTS delivery_filename TEXT;
    ALTER TABLE screens ADD COLUMN IF NOT EXISTS prepared_asset_key TEXT;
    ALTER TABLE screens ADD COLUMN IF NOT EXISTS prepared_asset_sha256 TEXT;
    ALTER TABLE screens ADD COLUMN IF NOT EXISTS prepared_asset_size BIGINT;
    ALTER TABLE screens ADD COLUMN IF NOT EXISTS prepared_draft_revision BIGINT;
    ALTER TABLE screens ADD COLUMN IF NOT EXISTS publication_pending_sha256 TEXT;
    ALTER TABLE screens ADD COLUMN IF NOT EXISTS publication_started_at TIMESTAMPTZ;
    ALTER TABLE screens ADD COLUMN IF NOT EXISTS published_sha256 TEXT;
    ALTER TABLE screens ADD COLUMN IF NOT EXISTS published_draft_revision BIGINT;
    ALTER TABLE screens ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
    ALTER TABLE screen_drafts ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;
    ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
    ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
    ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS job_title TEXT NOT NULL DEFAULT '';
    ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'system';
    ALTER TABLE web_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'administrator';
    ALTER TABLE web_users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE web_users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE web_users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
    ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS date_format TEXT NOT NULL DEFAULT 'DD.MM.YYYY';
    ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS dashboard_refresh_seconds INTEGER NOT NULL DEFAULT 45;
    ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS default_screen_resolution TEXT NOT NULL DEFAULT '1920×1080';
    ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS application_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS accent_color TEXT NOT NULL DEFAULT '#F4C915';
    ALTER TABLE site_settings ALTER COLUMN accent_color SET DEFAULT '#F4C915';
    ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS logo_filename TEXT NOT NULL DEFAULT '';
    ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS favicon_filename TEXT NOT NULL DEFAULT '';
    ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS signin_logo_size SMALLINT NOT NULL DEFAULT 1;
    CREATE UNIQUE INDEX IF NOT EXISTS locations_sftp_directory_id_unique ON locations(sftp_directory_id) WHERE sftp_directory_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS locations_sftp_username_unique ON locations(sftp_username) WHERE sftp_username IS NOT NULL;
    CREATE INDEX IF NOT EXISTS activity_events_created_at_index ON activity_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS activity_events_unread_index ON activity_events(read_at) WHERE read_at IS NULL;
    UPDATE web_users SET password_changed_at = created_at WHERE password_changed_at IS NULL;
    UPDATE site_settings SET accent_color = '#F4C915' WHERE accent_color = '#2563EB' AND COALESCE(updated_by, '') = '';
    UPDATE site_settings SET signin_logo_size = 1 WHERE signin_logo_size IS NULL OR signin_logo_size < 1 OR signin_logo_size > 7;
  `);

  const now = isoNow();
  await pool.query(
    'INSERT INTO site_settings (id, timezone, created_at, updated_at) VALUES (1, $1, $2, $2) ON CONFLICT (id) DO NOTHING',
    ['Europe/Moscow', now]
  );
}
