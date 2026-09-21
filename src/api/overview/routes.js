import express from 'express';

const RANGE_SPECS = Object.freeze({
  '1h': Object.freeze({ hours:1, bucketSeconds:60 }),
  '24h': Object.freeze({ hours:24, bucketSeconds:900 }),
  '7d': Object.freeze({ hours:24 * 7, bucketSeconds:3600 }),
  '30d': Object.freeze({ hours:24 * 30, bucketSeconds:21600 })
});

function rangeSpec(value) {
  const key = Object.hasOwn(RANGE_SPECS, value) ? value : '1h';
  return { key, ...RANGE_SPECS[key] };
}

export function createOverviewRouter({ store, realtime }) {
  const router = express.Router();

  router.get('/overview', async (request, response) => {
    const range = rangeSpec(String(request.query.range || '1h'));
    const since = new Date(Date.now() - range.hours * 60 * 60 * 1000).toISOString();
    const [counts, bindings, points] = await Promise.all([
      store.overview(),
      store.listDeviceBindings(),
      store.dashboardPlayerMetrics({ since, bucketSeconds:range.bucketSeconds })
    ]);

    const online = bindings.filter((binding) => realtime?.presenceForScreen(binding.screen_id)?.online === true);
    const offline = bindings.filter((binding) => realtime?.presenceForScreen(binding.screen_id)?.online !== true);
    const bound = bindings.length;
    const unbound = Math.max(0, Number(counts.screens) - bound);

    response.json({
      generated_at:new Date().toISOString(),
      range:range.key,
      summary:{
        locations:Number(counts.locations) || 0,
        screens:Number(counts.screens) || 0,
        published:Number(counts.published) || 0,
        bound,
        online:online.length,
        offline:offline.length,
        unbound
      },
      player_metrics:{ points },
      attention:offline.slice(0, 8).map((binding) => ({
        screen_id:Number(binding.screen_id),
        screen_name:binding.screen_name,
        location_name:binding.location_name,
        location_number:Number(binding.location_number) || null,
        last_seen_at:binding.session_last_seen_at || binding.device_last_seen_at || null
      }))
    });
  });

  return router;
}
