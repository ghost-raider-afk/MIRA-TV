import { isoNow, normaliseRow } from './helpers.js';

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
         ui_scale_percent = COALESCE($8, ui_scale_percent), updated_by = $9, updated_at = $10 WHERE id = 1 RETURNING *`,
        [application_name, accent_color, timezone, date_format, dashboard_refresh_seconds, default_screen_resolution, signin_logo_size, ui_scale_percent, updated_by, isoNow()]
      );
      return normaliseRow(rows[0]);
    },
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
