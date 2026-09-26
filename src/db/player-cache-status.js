import { isoNow } from './helpers.js';

function parseStatus(value) {
  if (!value) return null;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

export function createPlayerCacheStatusRepository(pool) {
  return Object.freeze({
    async upsertPlayerCacheStatus(deviceId, screenId, status) {
      const receivedAt = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO tv_player_cache_status
           (device_id, screen_id, reported_at, server_received_at, status_json)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (device_id) DO UPDATE SET
           screen_id = EXCLUDED.screen_id,
           reported_at = EXCLUDED.reported_at,
           server_received_at = EXCLUDED.server_received_at,
           status_json = EXCLUDED.status_json
         RETURNING device_id, screen_id, reported_at, server_received_at, status_json`,
        [deviceId, screenId, status.reported_at, receivedAt, JSON.stringify(status)]
      );
      const row = rows[0];
      return row ? {
        device_id:Number(row.device_id),
        screen_id:row.screen_id === null ? null : Number(row.screen_id),
        reported_at:row.reported_at instanceof Date ? row.reported_at.toISOString() : String(row.reported_at),
        server_received_at:row.server_received_at instanceof Date ? row.server_received_at.toISOString() : String(row.server_received_at),
        ...parseStatus(row.status_json)
      } : null;
    },

    async listPlayerCacheStatusByDeviceIds(deviceIds) {
      const ids = [...new Set((Array.isArray(deviceIds) ? deviceIds : [])
        .map(Number)
        .filter((id) => Number.isSafeInteger(id) && id > 0))];
      if (!ids.length) return [];
      const placeholders = ids.map((_id, index) => '
      const { rows } = await pool.query(
        `SELECT device_id, screen_id, reported_at, server_received_at, status_json
           FROM tv_player_cache_status
          WHERE device_id IN (${placeholders})`,
        ids
      );
      return rows.map((row) => ({
        device_id:Number(row.device_id),
        screen_id:row.screen_id === null ? null : Number(row.screen_id),
        reported_at:row.reported_at instanceof Date ? row.reported_at.toISOString() : String(row.reported_at),
        server_received_at:row.server_received_at instanceof Date ? row.server_received_at.toISOString() : String(row.server_received_at),
        ...(parseStatus(row.status_json) || {})
      }));
    }
  });
}
 + (index + 1)).join(', ');
      const { rows } = await pool.query(
        `SELECT device_id, screen_id, reported_at, server_received_at, status_json
           FROM tv_player_cache_status
          WHERE device_id IN (${placeholders})`,
        ids
      );
      return rows.map((row) => ({
        device_id:Number(row.device_id),
        screen_id:row.screen_id === null ? null : Number(row.screen_id),
        reported_at:row.reported_at instanceof Date ? row.reported_at.toISOString() : String(row.reported_at),
        server_received_at:row.server_received_at instanceof Date ? row.server_received_at.toISOString() : String(row.server_received_at),
        ...(parseStatus(row.status_json) || {})
      }));
    }
  });
}
