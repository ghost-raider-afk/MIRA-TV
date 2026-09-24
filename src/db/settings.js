import { isoNow, normaliseRow } from './helpers.js';
import { completeAnimationProfile } from '../shared/animation-profile.js';
import { completeScenePlaylist } from '../contracts/scene-playlist.js';

function parseJson(value) {
  try { return JSON.parse(value || '{}'); }
  catch { return {}; }
}

function normaliseAnimationSettings(row) {
  const value = normaliseRow(row);
  if (!value) return null;
  return {
    id: value.id,
    screen_id: value.screen_id === undefined ? undefined : Number(value.screen_id),
    enabled: value.enabled === true,
    preset_id: value.preset_id || 'cinematic-live-menu',
    profile: completeAnimationProfile(parseJson(value.profile_json)),
    scene_playlist: completeScenePlaylist(parseJson(value.scene_playlist_json)),
    updated_by: value.updated_by || '',
    created_at: value.created_at,
    updated_at: value.updated_at
  };
}

function animationValues(settings) {
  return [
    settings.enabled === true,
    settings.preset_id || 'cinematic-live-menu',
    JSON.stringify(settings.profile || {}),
    JSON.stringify(settings.scene_playlist || {})
  ];
}

export function createSettingsRepository(pool) {
  return Object.freeze({
    async setInitialSiteName(name) {
      await pool.query(
        `UPDATE site_settings SET application_name = $1, updated_at = $2
         WHERE id = 1 AND (application_name = '' OR application_name IN ('MIRA-TV', 'MIRA-TV 2'))`,
        [name, isoNow()]
      );
    },

    async getSiteSettings() {
      const { rows } = await pool.query('SELECT * FROM site_settings WHERE id = 1');
      return normaliseRow(rows[0]);
    },

    async updateSiteSettings({ application_name, accent_color, timezone, date_format, dashboard_refresh_seconds, default_screen_resolution, signin_logo_size, ui_scale_percent, updated_by }) {
      const { rows } = await pool.query(
        `UPDATE site_settings SET application_name = $1, accent_color = $2, timezone = $3, date_format = $4,
         dashboard_refresh_seconds = $5, default_screen_resolution = $6, signin_logo_size = $7,
         ui_scale_percent = $8, updated_by = $9, updated_at = $10 WHERE id = 1 RETURNING *`,
        [application_name, accent_color, timezone, date_format, dashboard_refresh_seconds, default_screen_resolution, signin_logo_size, ui_scale_percent, updated_by, isoNow()]
      );
      return normaliseRow(rows[0]);
    },

    async getAnimationSettings() {
      const { rows } = await pool.query('SELECT * FROM animation_settings WHERE id = 1');
      return normaliseAnimationSettings(rows[0]);
    },

    async getScreenAnimationSettings(screenId) {
      const { rows } = await pool.query('SELECT * FROM screen_animation_settings WHERE screen_id = $1', [screenId]);
      return normaliseAnimationSettings(rows[0]);
    },

    async updateAnimationSettings({ enabled, preset_id, profile, scene_playlist, updated_by }) {
      const { rows } = await pool.query(
        `UPDATE animation_settings SET enabled = $1, preset_id = $2, profile_json = $3,
         scene_playlist_json = $4, updated_by = $5, updated_at = $6
         WHERE id = 1 RETURNING *`,
        [enabled, preset_id, JSON.stringify(profile), JSON.stringify(scene_playlist), updated_by, isoNow()]
      );
      return normaliseAnimationSettings(rows[0]);
    },

    async applyAnimationSettingsToScreens(screenIds, settings, updatedBy) {
      const applied = [];
      const values = animationValues(settings);
      for (const screenId of screenIds) {
        const { rows } = await pool.query(
          `INSERT INTO screen_animation_settings (
             screen_id, enabled, preset_id, profile_json, scene_playlist_json, updated_by, updated_at
           )
           SELECT s.id, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP
           FROM screens s WHERE s.id = $1
           ON CONFLICT (screen_id) DO UPDATE SET
             enabled = EXCLUDED.enabled, preset_id = EXCLUDED.preset_id, profile_json = EXCLUDED.profile_json,
             scene_playlist_json = EXCLUDED.scene_playlist_json,
             updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at
           RETURNING screen_id`,
          [screenId, ...values, updatedBy]
        );
        if (rows[0]) applied.push(Number(rows[0].screen_id));
      }
      return applied;
    },

    async setSiteAsset(kind, filename, updatedBy) {
      const now = isoNow();
      const statement = kind === 'logo'
        ? 'UPDATE site_settings SET logo_filename = $1, updated_by = $2, updated_at = $3 WHERE id = 1 RETURNING *'
        : 'UPDATE site_settings SET favicon_filename = $1, updated_by = $2, updated_at = $3 WHERE id = 1 RETURNING *';
      const { rows } = await pool.query(statement, [filename, updatedBy, now]);
      return normaliseRow(rows[0]);
    }
  });
}
