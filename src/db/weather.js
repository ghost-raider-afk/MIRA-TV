import { completeWeatherWidget } from '../contracts/weather.js';

function parse(value) {
  try { return completeWeatherWidget(JSON.parse(value || '{}')); }
  catch { return completeWeatherWidget(); }
}

function normalise(row) {
  if (!row) return null;
  return {
    id: row.id === undefined ? undefined : Number(row.id),
    screen_id: row.screen_id === undefined ? undefined : Number(row.screen_id),
    ...parse(row.config_json),
    updated_by: row.updated_by || '',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function createWeatherRepository(pool) {
  return Object.freeze({
    async getWeatherSettings() {
      const { rows } = await pool.query('SELECT * FROM weather_settings WHERE id = 1');
      return normalise(rows[0]) || { id: 1, ...completeWeatherWidget() };
    },
    async updateWeatherSettings(settings, updatedBy) {
      const { rows } = await pool.query(
        `UPDATE weather_settings
            SET config_json = $1, updated_by = $2, updated_at = NOW()
          WHERE id = 1
          RETURNING *`,
        [JSON.stringify(completeWeatherWidget(settings)), String(updatedBy || '')]
      );
      return normalise(rows[0]);
    },
    async getScreenWeatherSettings(screenId) {
      const { rows } = await pool.query('SELECT * FROM screen_weather_settings WHERE screen_id = $1', [screenId]);
      return normalise(rows[0]) || { screen_id: Number(screenId), ...completeWeatherWidget() };
    },
    async applyWeatherSettingsToScreens(screenIds, settings, updatedBy) {
      const applied = [];
      const config = JSON.stringify(completeWeatherWidget(settings));
      for (const screenId of screenIds) {
        const { rows } = await pool.query(
          `INSERT INTO screen_weather_settings (screen_id, config_json, updated_by, updated_at)
           SELECT s.id, $2, $3, NOW() FROM screens s WHERE s.id = $1
           ON CONFLICT (screen_id) DO UPDATE SET
             config_json = EXCLUDED.config_json,
             updated_by = EXCLUDED.updated_by,
             updated_at = EXCLUDED.updated_at
           RETURNING screen_id`,
          [screenId, config, String(updatedBy || '')]
        );
        if (rows[0]) applied.push(Number(rows[0].screen_id));
      }
      return applied;
    }
  });
}
