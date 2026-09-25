import { isoNow } from './helpers.js';

export function createPlayerTelemetryRepository(pool) {
  return Object.freeze({
    async insertPlayerLogBatch(deviceId, bootId, events) {
      if (!events.length) return 0;
      const receivedAt = isoNow();
      let acceptedThrough = 0;
      for (const event of events) {
        await pool.query(
          `INSERT INTO tv_player_logs
             (device_id, boot_id, seq, device_timestamp, server_received_at, level, event_type, context_revision, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (device_id, boot_id, seq) DO NOTHING`,
          [
            deviceId,
            bootId,
            event.seq,
            event.device_timestamp || null,
            receivedAt,
            event.level,
            event.type,
            event.revision || '',
            JSON.stringify(event.data || {})
          ]
        );
        acceptedThrough = Math.max(acceptedThrough, event.seq);
      }
      return acceptedThrough;
    },

    async listLatestPlayerLogsByDeviceIds(deviceIds) {
      const ids = [...new Set((Array.isArray(deviceIds) ? deviceIds : [])
        .map(Number)
        .filter((id) => Number.isSafeInteger(id) && id > 0))];
      if (!ids.length) return [];
      const { rows } = await pool.query(
        `SELECT DISTINCT ON (device_id)
                device_id, boot_id, seq, level, event_type, context_revision, server_received_at, metadata
           FROM tv_player_logs
          WHERE device_id = ANY($1::bigint[])
          ORDER BY device_id, server_received_at DESC, seq DESC`,
        [ids]
      );
      return rows.map((row) => {
        let metadata = {};
        try {
          metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : (row.metadata || {});
        } catch {}
        return {
          device_id: Number(row.device_id),
          boot_id: row.boot_id,
          seq: Number(row.seq),
          level: row.level,
          event_type: row.event_type,
          context_revision: row.context_revision || '',
          server_received_at: row.server_received_at,
          metadata
        };
      });
    },

    async prunePlayerLogs(retentionDays) {
      const { rowCount } = await pool.query(
        `DELETE FROM tv_player_logs
          WHERE server_received_at < NOW() - ($1::int * INTERVAL '1 day')`,
        [retentionDays]
      );
      return rowCount;
    }
  });
}
