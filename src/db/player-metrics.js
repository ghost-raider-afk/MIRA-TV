import { isoNow } from './helpers.js';

function metricPoint(row) {
  return {
    at: row.bucket instanceof Date ? row.bucket.toISOString() : String(row.bucket),
    online_tvs: Number(row.online_tvs) || 0,
    fps_avg: row.fps_avg === null ? null : Number(row.fps_avg),
    fps_min: row.fps_min === null ? null : Number(row.fps_min),
    player_load_percent: row.player_load_percent === null ? null : Number(row.player_load_percent),
    memory_mb: row.memory_mb === null ? null : Number(row.memory_mb),
    memory_max_mb: row.memory_max_mb === null ? null : Number(row.memory_max_mb),
    uptime_hours: row.uptime_hours === null ? null : Number(row.uptime_hours)
  };
}

export function createPlayerMetricsRepository(pool) {
  return Object.freeze({
    async insertPlayerMetric(deviceId, screenId, metric) {
      const receivedAt = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO tv_player_metrics
          (device_id, screen_id, sampled_at, server_received_at, fps_avg, player_load_percent,
           js_heap_used_bytes, device_memory_gb, hardware_concurrency, uptime_seconds)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, sampled_at, server_received_at`,
        [
          deviceId,
          screenId,
          receivedAt,
          receivedAt,
          metric.fps_avg,
          metric.player_load_percent,
          metric.js_heap_used_bytes,
          metric.device_memory_gb,
          metric.hardware_concurrency,
          metric.uptime_seconds
        ]
      );
      return rows[0] || null;
    },

    async dashboardPlayerMetrics({ since, bucketSeconds, screenId = null }) {
      const interval = `${Math.max(60, Number(bucketSeconds) || 60)} seconds`;
      const selectedScreenId = Number.isInteger(Number(screenId)) && Number(screenId) > 0 ? Number(screenId) : null;
      const { rows } = await pool.query(
        `SELECT
           date_bin($2::interval, sampled_at, TIMESTAMPTZ '2001-01-01 00:00:00+00') AS bucket,
           COUNT(DISTINCT device_id)::int AS online_tvs,
           AVG(fps_avg) AS fps_avg,
           MIN(fps_avg) AS fps_min,
           AVG(player_load_percent) AS player_load_percent,
           AVG(js_heap_used_bytes)::double precision / 1048576.0 AS memory_mb,
           MAX(js_heap_used_bytes)::double precision / 1048576.0 AS memory_max_mb,
           AVG(uptime_seconds)::double precision / 3600.0 AS uptime_hours
         FROM tv_player_metrics
         WHERE sampled_at >= $1
           AND ($3::bigint IS NULL OR screen_id = $3)
         GROUP BY bucket
         ORDER BY bucket ASC`,
        [since, interval, selectedScreenId]
      );
      return rows.map(metricPoint);
    },

    async latestPlayerMetricsByScreen() {
      const { rows } = await pool.query(
        `SELECT DISTINCT ON (screen_id)
           screen_id, device_id, sampled_at, server_received_at,
           fps_avg, player_load_percent, js_heap_used_bytes,
           device_memory_gb, hardware_concurrency, uptime_seconds
         FROM tv_player_metrics
         WHERE screen_id IS NOT NULL
         ORDER BY screen_id, sampled_at DESC, id DESC`
      );
      return rows.map((row) => ({
        screen_id:Number(row.screen_id),
        device_id:Number(row.device_id),
        sampled_at:row.sampled_at instanceof Date ? row.sampled_at.toISOString() : String(row.sampled_at),
        server_received_at:row.server_received_at instanceof Date ? row.server_received_at.toISOString() : String(row.server_received_at),
        fps_avg:row.fps_avg === null ? null : Number(row.fps_avg),
        player_load_percent:row.player_load_percent === null ? null : Number(row.player_load_percent),
        js_heap_used_bytes:row.js_heap_used_bytes === null ? null : Number(row.js_heap_used_bytes),
        memory_mb:row.js_heap_used_bytes === null ? null : Number(row.js_heap_used_bytes) / 1048576,
        device_memory_gb:row.device_memory_gb === null ? null : Number(row.device_memory_gb),
        hardware_concurrency:row.hardware_concurrency === null ? null : Number(row.hardware_concurrency),
        uptime_seconds:row.uptime_seconds === null ? null : Number(row.uptime_seconds)
      }));
    },

    async prunePlayerMetrics(retentionDays) {
      const { rowCount } = await pool.query(
        `DELETE FROM tv_player_metrics
          WHERE sampled_at < NOW() - ($1::int * INTERVAL '1 day')`,
        [retentionDays]
      );
      return rowCount;
    }
  });
}
