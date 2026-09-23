import { isoNow, jsonValue } from './helpers.js';

function snapshotRecord(row) {
  if (!row) return null;
  return {
    source_key: row.source_key,
    location_name: row.location_name || '',
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    timezone: row.timezone,
    provider: row.provider,
    snapshot: jsonValue(row.snapshot_json, null),
    fetched_at: row.fetched_at instanceof Date ? row.fetched_at.toISOString() : row.fetched_at,
    fresh_until: row.fresh_until instanceof Date ? row.fresh_until.toISOString() : row.fresh_until,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  };
}

function providerRecord(row) {
  if (!row) return null;
  return {
    provider: row.provider,
    status: row.status,
    failure_count: Number(row.failure_count || 0),
    last_error: row.last_error || '',
    last_checked_at: row.last_checked_at instanceof Date ? row.last_checked_at.toISOString() : row.last_checked_at,
    last_success_at: row.last_success_at instanceof Date ? row.last_success_at.toISOString() : row.last_success_at,
    cooldown_until: row.cooldown_until instanceof Date ? row.cooldown_until.toISOString() : row.cooldown_until,
    changed_at: row.changed_at instanceof Date ? row.changed_at.toISOString() : row.changed_at
  };
}

export function createWeatherRepository(pool) {
  return Object.freeze({
    async getWeatherSnapshotRecord(sourceKey) {
      const { rows } = await pool.query('SELECT * FROM weather_snapshots WHERE source_key = $1', [sourceKey]);
      return snapshotRecord(rows[0]);
    },

    async upsertWeatherSnapshotRecord(record) {
      const now = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO weather_snapshots (
          source_key, location_name, latitude, longitude, timezone, provider,
          snapshot_json, fetched_at, fresh_until, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (source_key) DO UPDATE SET
          location_name=EXCLUDED.location_name,
          latitude=EXCLUDED.latitude,
          longitude=EXCLUDED.longitude,
          timezone=EXCLUDED.timezone,
          provider=EXCLUDED.provider,
          snapshot_json=EXCLUDED.snapshot_json,
          fetched_at=EXCLUDED.fetched_at,
          fresh_until=EXCLUDED.fresh_until,
          updated_at=EXCLUDED.updated_at
        RETURNING *`,
        [
          record.source_key,
          record.location_name || '',
          record.latitude,
          record.longitude,
          record.timezone,
          record.provider,
          JSON.stringify(record.snapshot),
          record.fetched_at,
          record.fresh_until,
          now
        ]
      );
      return snapshotRecord(rows[0]);
    },

    async listWeatherSceneDocuments() {
      const { rows } = await pool.query('SELECT screen_id, scene_json FROM screen_drafts ORDER BY screen_id');
      return rows.map((row) => ({
        screen_id: Number(row.screen_id),
        scene: jsonValue(row.scene_json, { version:1, elements:[] })
      }));
    },

    async getWeatherProviderStatus(provider) {
      const { rows } = await pool.query('SELECT * FROM weather_provider_status WHERE provider = $1', [provider]);
      return providerRecord(rows[0]);
    },

    async setWeatherProviderStatus({ provider, status, error = '', cooldownUntil = null }) {
      const previous = await this.getWeatherProviderStatus(provider);
      const now = isoNow();
      const failureCount = status === 'failed' ? Number(previous?.failure_count || 0) + 1 : 0;
      const lastSuccessAt = status === 'healthy' ? now : previous?.last_success_at || null;
      const changedAt = previous?.status === status ? previous.changed_at || now : now;
      const { rows } = await pool.query(
        `INSERT INTO weather_provider_status (
          provider, status, failure_count, last_error, last_checked_at,
          last_success_at, cooldown_until, changed_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (provider) DO UPDATE SET
          status=EXCLUDED.status,
          failure_count=EXCLUDED.failure_count,
          last_error=EXCLUDED.last_error,
          last_checked_at=EXCLUDED.last_checked_at,
          last_success_at=EXCLUDED.last_success_at,
          cooldown_until=EXCLUDED.cooldown_until,
          changed_at=EXCLUDED.changed_at
        RETURNING *`,
        [provider, status, failureCount, String(error || '').slice(0, 2000), now, lastSuccessAt, cooldownUntil, changedAt]
      );
      return { previous, current: providerRecord(rows[0]) };
    }
  });
}
