import { DEFAULT_WEATHER_WIDGET } from '../../contracts/weather.js';

export async function migrateWeatherWidget(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS weather_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      config_json TEXT NOT NULL DEFAULT '{}',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS screen_weather_settings (
      screen_id BIGINT PRIMARY KEY REFERENCES screens(id) ON DELETE CASCADE,
      config_json TEXT NOT NULL DEFAULT '{}',
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(
    `INSERT INTO weather_settings (id, config_json)
     VALUES (1, $1)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(DEFAULT_WEATHER_WIDGET)]
  );
}
