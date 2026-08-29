import { isoNow, jsonValue, normaliseMenuRecord, normaliseRow } from './helpers.js';

function normaliseDraft(row, screenId) {
  const record = normaliseMenuRecord(row) || { screen_id: screenId, rows: [], settings: {}, revision: 0 };
  return { ...record, revision: Number(record.revision || 0) };
}

export function createScreensRepository(pool) {
  async function getScreen(id) {
    const { rows } = await pool.query(
      'SELECT s.*, l.name AS location_name FROM screens s JOIN locations l ON l.id = s.location_id WHERE s.id = $1', [id]
    );
    return normaliseRow(rows[0]);
  }
  async function listScreensByLocation(locationId) {
    const { rows } = await pool.query(
      'SELECT s.*, l.name AS location_name FROM screens s JOIN locations l ON l.id = s.location_id WHERE s.location_id = $1 ORDER BY s.location_number, s.id', [locationId]
    );
    return rows.map(normaliseRow);
  }
  async function nextLocationNumber(locationId, { lockLocation = false } = {}) {
    if (lockLocation) {
      const locked = await pool.query('SELECT id FROM locations WHERE id = $1 FOR UPDATE', [locationId]);
      if (!locked.rowCount) return null;
    }
    const { rows } = await pool.query('SELECT COALESCE(MAX(location_number), 0)::int AS current_number FROM screens WHERE location_id = $1', [locationId]);
    return Number(rows[0].current_number || 0) + 1;
  }
  return Object.freeze({
    async listScreens() {
      const { rows } = await pool.query('SELECT s.*, l.name AS location_name FROM screens s JOIN locations l ON l.id = s.location_id ORDER BY l.name, s.location_number, s.id');
      return rows.map(normaliseRow);
    },
    listScreensByLocation, getScreen,
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
        'INSERT INTO screens (location_id, location_number, name, resolution, status, active, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id',
        [location_id, locationNumber, resolvedName, resolution, status, active, now]
      );
      const id = Number(rows[0].id);
      await pool.query('INSERT INTO screen_drafts (screen_id, rows_json, settings_json, revision, updated_at) VALUES ($1,$2,$3,1,$4)', [id,'[]','{}',now]);
      const { rows: animationRows } = await pool.query('SELECT enabled, preset_id, profile_json, entity_json, announcement_json, brand_json, environment_json, scene_playlist_json, updated_by FROM animation_settings WHERE id = 1');
      const animation = animationRows[0];
      if (animation) await pool.query(
        `INSERT INTO screen_animation_settings (screen_id, enabled, preset_id, profile_json, entity_json, announcement_json, brand_json, environment_json, scene_playlist_json, updated_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (screen_id) DO NOTHING`,
        [id, animation.enabled === true, animation.preset_id || 'cinematic-live-menu', animation.profile_json || '{}', animation.entity_json || '{}', animation.announcement_json || '{}', animation.brand_json || '{}', animation.environment_json || '{}', animation.scene_playlist_json || '{}', animation.updated_by || '', now]
      );
      return getScreen(id);
    },
    async updateScreen(id, { location_id, name, resolution = '1920×1080', status = 'draft', active = true }) {
      const currentResult = await pool.query('SELECT location_id, location_number FROM screens WHERE id = $1', [id]);
      if (!currentResult.rowCount) return null;
      const current = currentResult.rows[0];
      let locationNumber = Number(current.location_number);
      if (Number(current.location_id) !== Number(location_id)) {
        locationNumber = await nextLocationNumber(location_id, { lockLocation: true });
        if (!locationNumber) return null;
      }
      const { rowCount } = await pool.query(
        'UPDATE screens SET location_id=$1, location_number=$2, name=$3, resolution=$4, status=$5, active=$6, updated_at=$7 WHERE id=$8',
        [location_id, locationNumber, name, resolution, status, active, isoNow(), id]
      );
      return rowCount ? getScreen(id) : null;
    },
    async deleteScreen(id) {
      const { rowCount } = await pool.query('DELETE FROM screens WHERE id = $1', [id]);
      return rowCount > 0;
    },
    async nextScreenName(locationId) { return `ТВ ${await nextLocationNumber(locationId)}`; },
    async getScreenDraft(screenId) {
      const { rows } = await pool.query('SELECT * FROM screen_drafts WHERE screen_id = $1', [screenId]);
      return normaliseDraft(rows[0], screenId);
    },
    async saveScreenDraft(screenId, { rows, settings }, expectedRevision) {
      const now = isoNow();
      let saved;
      if (Number.isInteger(expectedRevision) && expectedRevision > 0) {
        const result = await pool.query(
          'UPDATE screen_drafts SET rows_json=$1, settings_json=$2, revision=revision+1, updated_at=$3 WHERE screen_id=$4 AND revision=$5 RETURNING *',
          [JSON.stringify(rows), JSON.stringify(settings), now, screenId, expectedRevision]
        );
        saved = result.rows[0];
        if (!saved) return null;
      } else {
        const result = await pool.query(
          `INSERT INTO screen_drafts (screen_id, rows_json, settings_json, revision, updated_at) VALUES ($1,$2,$3,1,$4)
           ON CONFLICT (screen_id) DO UPDATE SET rows_json=EXCLUDED.rows_json, settings_json=EXCLUDED.settings_json, revision=screen_drafts.revision+1, updated_at=EXCLUDED.updated_at RETURNING *`,
          [screenId, JSON.stringify(rows), JSON.stringify(settings), now]
        );
        saved = result.rows[0];
      }
      await pool.query("UPDATE screens SET status='draft', updated_at=$1 WHERE id=$2", [now, screenId]);
      return normaliseDraft(saved, screenId);
    },
    async isScreenBackgroundReferenced(url) {
      if (!url) return false;
      const { rows } = await pool.query('SELECT settings_json FROM screen_drafts');
      return rows.some((row) => jsonValue(row.settings_json, {}).background_image_url === url);
    },
    async screensUsingCatalog(kind, catalogId) {
      const column = kind === 'product' ? 'product_id' : 'packaging_id';
      const { rows } = await pool.query('SELECT d.screen_id, d.rows_json, s.name AS screen_name, l.name AS location_name FROM screen_drafts d JOIN screens s ON s.id=d.screen_id JOIN locations l ON l.id=s.location_id');
      return rows.filter((row) => jsonValue(row.rows_json, []).some((item) => Number(item?.[column]) === Number(catalogId)))
        .map((row) => ({ screen_id:Number(row.screen_id), screen_name:row.screen_name, location_name:row.location_name }));
    }
  });
}
