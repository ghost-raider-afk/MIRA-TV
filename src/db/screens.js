import { isoNow, jsonValue, normaliseMenuRecord, normaliseRow } from './helpers.js';

function normaliseDraft(row, screenId) {
  const record = normaliseMenuRecord(row) || { screen_id: screenId, rows: [], settings: {}, revision: 0 };
  return { ...record, revision: Number(record.revision || 0) };
}

function screenFilename(locationNumber) {
  const number = Number(locationNumber);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Монитор не имеет корректного номера внутри торговой точки.');
  return `monitor-${number}.jpg`;
}

export function createScreensRepository(pool) {
  async function getScreen(id) {
    const { rows } = await pool.query(
      `SELECT s.*, l.name AS location_name, d.name AS sftp_directory_name,
       CASE WHEN d.name IS NULL THEN NULL ELSE '/' || d.name || '/' || s.delivery_filename END AS sftp_path
       FROM screens s JOIN locations l ON l.id = s.location_id
       LEFT JOIN sftp_directories d ON d.id = l.sftp_directory_id
       WHERE s.id = $1`,
      [id]
    );
    return normaliseRow(rows[0]);
  }

  async function listScreensByLocation(locationId) {
    const { rows } = await pool.query(
      `SELECT s.*, l.name AS location_name, d.name AS sftp_directory_name,
       CASE WHEN d.name IS NULL THEN NULL ELSE '/' || d.name || '/' || s.delivery_filename END AS sftp_path
       FROM screens s JOIN locations l ON l.id = s.location_id
       LEFT JOIN sftp_directories d ON d.id = l.sftp_directory_id
       WHERE s.location_id = $1 ORDER BY s.location_number, s.id`,
      [locationId]
    );
    return rows.map(normaliseRow);
  }

  async function nextLocationNumber(locationId, { lockLocation = false } = {}) {
    if (lockLocation) {
      const locked = await pool.query('SELECT id FROM locations WHERE id = $1 FOR UPDATE', [locationId]);
      if (!locked.rowCount) return null;
    }
    const { rows } = await pool.query(
      'SELECT COALESCE(MAX(location_number), 0)::int AS current_number FROM screens WHERE location_id = $1',
      [locationId]
    );
    return Number(rows[0].current_number || 0) + 1;
  }

  return Object.freeze({
    async listScreens() {
      const { rows } = await pool.query(
        `SELECT s.*, l.name AS location_name, d.name AS sftp_directory_name,
         CASE WHEN d.name IS NULL THEN NULL ELSE '/' || d.name || '/' || s.delivery_filename END AS sftp_path
         FROM screens s JOIN locations l ON l.id = s.location_id
         LEFT JOIN sftp_directories d ON d.id = l.sftp_directory_id
         ORDER BY l.name, s.location_number, s.id`
      );
      return rows.map(normaliseRow);
    },

    listScreensByLocation,
    getScreen,

    async lockScreen(id) {
      const { rowCount } = await pool.query('SELECT id FROM screens WHERE id = $1 FOR UPDATE', [id]);
      return rowCount > 0;
    },

    async createScreen({ location_id, name = '', resolution = '1920×1080', status = 'draft', active = true }) {
      const now = isoNow();
      const locationNumber = await nextLocationNumber(location_id, { lockLocation: true });
      if (!locationNumber) return null;
      const resolvedName = name || `ТВ ${locationNumber}`;
      const { rows } = await pool.query(
        `INSERT INTO screens (location_id, location_number, name, resolution, status, active, delivery_filename, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING id`,
        [location_id, locationNumber, resolvedName, resolution, status, active, screenFilename(locationNumber), now]
      );
      const id = Number(rows[0].id);
      await pool.query(
        'INSERT INTO screen_drafts (screen_id, rows_json, settings_json, revision, updated_at) VALUES ($1, $2, $3, 1, $4)',
        [id, '[]', '{}', now]
      );
      const { rows: animationRows } = await pool.query(
        'SELECT enabled, preset_id, profile_json, entity_json, announcement_json, brand_json, environment_json, scene_playlist_json, updated_by FROM animation_settings WHERE id = 1'
      );
      const animation = animationRows[0];
      if (animation) {
        await pool.query(
          `INSERT INTO screen_animation_settings (
             screen_id, enabled, preset_id, profile_json, entity_json, announcement_json, brand_json, environment_json, scene_playlist_json, updated_by, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (screen_id) DO NOTHING`,
          [
            Number(id), animation.enabled === true, animation.preset_id || 'cinematic-live-menu', animation.profile_json || '{}', animation.entity_json || '{}',
            animation.announcement_json || '{}', animation.brand_json || '{}', animation.environment_json || '{}', animation.scene_playlist_json || '{}', animation.updated_by || '', now
          ]
        );
      }
      return getScreen(id);
    },

    async updateScreen(id, { location_id, name, resolution = '1920×1080', status = 'draft', active = true }) {
      const currentResult = await pool.query('SELECT location_id, location_number FROM screens WHERE id = $1', [id]);
      if (!currentResult.rowCount) return null;
      const current = currentResult.rows[0];
      let locationNumber = Number(current.location_number);
      let filename = screenFilename(locationNumber);
      if (Number(current.location_id) !== Number(location_id)) {
        locationNumber = await nextLocationNumber(location_id, { lockLocation: true });
        if (!locationNumber) return null;
        filename = screenFilename(locationNumber);
      }
      const { rowCount } = await pool.query(
        `UPDATE screens SET location_id = $1, location_number = $2, delivery_filename = $3, name = $4, resolution = $5, status = $6,
         active = $7, updated_at = $8 WHERE id = $9`,
        [location_id, locationNumber, filename, name, resolution, status, active, isoNow(), id]
      );
      return rowCount ? getScreen(id) : null;
    },

    async invalidatePreparedAsset(screenId) {
      const { rowCount } = await pool.query(
        `UPDATE screens SET prepared_asset_key = NULL, prepared_asset_sha256 = NULL, prepared_asset_size = NULL,
         prepared_draft_revision = NULL, publication_pending_sha256 = NULL, publication_started_at = NULL,
         status = 'draft', updated_at = $1
         WHERE id = $2 AND publication_pending_sha256 IS NULL`,
        [isoNow(), screenId]
      );
      return rowCount > 0;
    },

    async deleteScreen(id) {
      const { rowCount } = await pool.query('DELETE FROM screens WHERE id = $1', [id]);
      return rowCount > 0;
    },

    async savePreparedAsset(screenId, asset, draftRevision) {
      const { rowCount } = await pool.query(
        `UPDATE screens SET prepared_asset_key = $1, prepared_asset_sha256 = $2, prepared_asset_size = $3,
         prepared_draft_revision = $4, publication_pending_sha256 = NULL, publication_started_at = NULL,
         status = 'ready', updated_at = $5
         WHERE id = $6 AND publication_pending_sha256 IS NULL`,
        [asset.key, asset.sha256, asset.size, draftRevision, isoNow(), screenId]
      );
      return rowCount ? getScreen(screenId) : null;
    },

    async markPublicationStarted(screenId, expectedSha256, expectedDraftRevision) {
      const { rowCount } = await pool.query(
        `UPDATE screens SET publication_pending_sha256 = prepared_asset_sha256, publication_started_at = $1, updated_at = $1
         WHERE id = $2 AND publication_pending_sha256 IS NULL
           AND prepared_asset_key IS NOT NULL AND prepared_asset_sha256 = $3
           AND prepared_draft_revision = $4`,
        [isoNow(), screenId, expectedSha256, expectedDraftRevision]
      );
      return rowCount ? getScreen(screenId) : null;
    },

    async clearPublicationPending(screenId, expectedSha256) {
      await pool.query(
        `UPDATE screens SET publication_pending_sha256 = NULL, publication_started_at = NULL, updated_at = $1
         WHERE id = $2 AND publication_pending_sha256 = $3`,
        [isoNow(), screenId, expectedSha256]
      );
      return getScreen(screenId);
    },

    async markScreenPublished(screenId, expectedSha256) {
      const { rowCount } = await pool.query(
        `UPDATE screens SET status = 'published', published_sha256 = $1,
         published_draft_revision = prepared_draft_revision, published_at = $2,
         publication_pending_sha256 = NULL, publication_started_at = NULL,
         prepared_asset_key = NULL, prepared_asset_sha256 = NULL, prepared_asset_size = NULL, prepared_draft_revision = NULL,
         updated_at = $2
         WHERE id = $3 AND publication_pending_sha256 = $1`,
        [expectedSha256, isoNow(), screenId]
      );
      return rowCount ? getScreen(screenId) : null;
    },

    async listPendingPublications() {
      const { rows } = await pool.query(
        `SELECT s.*, l.name AS location_name, d.name AS sftp_directory_name
         FROM screens s JOIN locations l ON l.id = s.location_id
         LEFT JOIN sftp_directories d ON d.id = l.sftp_directory_id
         WHERE s.publication_pending_sha256 IS NOT NULL AND s.publication_started_at IS NOT NULL`
      );
      return rows.map(normaliseRow);
    },

    async listPreparedAssetKeys() {
      const { rows } = await pool.query('SELECT prepared_asset_key FROM screens WHERE prepared_asset_key IS NOT NULL');
      return rows.map((row) => row.prepared_asset_key).filter(Boolean);
    },

    async nextScreenName(locationId) {
      const next = await nextLocationNumber(locationId);
      return `ТВ ${next}`;
    },

    async getScreenDraft(screenId) {
      const { rows } = await pool.query('SELECT * FROM screen_drafts WHERE screen_id = $1', [screenId]);
      return normaliseDraft(rows[0], screenId);
    },

    async saveScreenDraft(screenId, { rows, settings }, expectedRevision) {
      const now = isoNow();
      let saved;
      if (Number.isInteger(expectedRevision) && expectedRevision > 0) {
        const result = await pool.query(
          `UPDATE screen_drafts SET rows_json = $1, settings_json = $2, revision = revision + 1, updated_at = $3
           WHERE screen_id = $4 AND revision = $5 RETURNING *`,
          [JSON.stringify(rows), JSON.stringify(settings), now, screenId, expectedRevision]
        );
        saved = result.rows[0];
        if (!saved) return null;
      } else {
        const result = await pool.query(
          `INSERT INTO screen_drafts (screen_id, rows_json, settings_json, revision, updated_at)
           VALUES ($1, $2, $3, 1, $4)
           ON CONFLICT (screen_id) DO UPDATE SET rows_json = EXCLUDED.rows_json,
           settings_json = EXCLUDED.settings_json, revision = screen_drafts.revision + 1, updated_at = EXCLUDED.updated_at
           RETURNING *`,
          [screenId, JSON.stringify(rows), JSON.stringify(settings), now]
        );
        saved = result.rows[0];
      }
      const screenResult = await pool.query('SELECT location_number FROM screens WHERE id = $1', [screenId]);
      if (!screenResult.rowCount) return null;
      const canonicalFilename = screenFilename(Number(screenResult.rows[0].location_number));
      await pool.query(
        `UPDATE screens SET prepared_asset_key = NULL, prepared_asset_sha256 = NULL, prepared_asset_size = NULL,
         prepared_draft_revision = NULL, publication_pending_sha256 = NULL, publication_started_at = NULL,
         delivery_filename = $1, status = 'draft', updated_at = $2 WHERE id = $3`,
        [canonicalFilename, now, screenId]
      );
      return normaliseDraft(saved, screenId);
    },

    async isScreenBackgroundReferenced(url) {
      if (!url) return false;
      const { rows } = await pool.query('SELECT settings_json FROM screen_drafts');
      return rows.some((row) => jsonValue(row.settings_json, {}).background_image_url === url);
    },

    async screensUsingCatalog(kind, catalogId) {
      const column = kind === 'product' ? 'product_id' : 'packaging_id';
      const { rows } = await pool.query(
        `SELECT d.screen_id, d.rows_json, s.name AS screen_name, l.name AS location_name
         FROM screen_drafts d JOIN screens s ON s.id = d.screen_id JOIN locations l ON l.id = s.location_id`
      );
      return rows
        .filter((row) => jsonValue(row.rows_json, []).some((item) => Number(item?.[column]) === Number(catalogId)))
        .map((row) => ({ screen_id: Number(row.screen_id), screen_name: row.screen_name, location_name: row.location_name }));
    }
  });
}
