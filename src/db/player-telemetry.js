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
