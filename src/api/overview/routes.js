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

function positiveScreenId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function latestSeen(binding) {
  return binding?.realtime_last_seen_at || binding?.session_last_seen_at || binding?.device_last_seen_at || null;
}

function problemState({ binding, online, latestMetric, staleAfterMs }) {
  if (!binding) return { code:'unbound', label:'TV не подключён' };
  if (!online) return { code:'offline', label:'Нет связи с Player' };
  if (!latestMetric) return { code:'telemetry_missing', label:'Телеметрия ещё не получена' };
  if (Date.now() - Date.parse(latestMetric.sampled_at) > staleAfterMs) {
    return { code:'telemetry_stale', label:'Телеметрия не обновляется' };
  }
  return null;
}

function screenLabel(screen) {
  const number = Number(screen.location_number);
  return number > 0 ? `TV ${number}` : (screen.name || `TV ${screen.id}`);
}

export function createOverviewRouter({ store, realtime, config }) {
  const router = express.Router();

  router.get('/overview', async (request, response) => {
    const range = rangeSpec(String(request.query.range || '1h'));
    const since = new Date(Date.now() - range.hours * 60 * 60 * 1000).toISOString();
    const [counts, screens, bindings, latestMetrics] = await Promise.all([
      store.overview(),
      store.listScreens(),
      store.listDeviceBindings(),
      store.latestPlayerMetricsByScreen()
    ]);

    const bindingByScreen = new Map(bindings.map((binding) => [Number(binding.screen_id), binding]));
    const metricByScreen = new Map(latestMetrics.map((metric) => [Number(metric.screen_id), metric]));
    const staleAfterMs = Math.max(120000, Number(config?.playerMetricsIntervalSeconds || 60) * 2500);

    const tvs = screens.map((screen) => {
      const screenId = Number(screen.id);
      const binding = bindingByScreen.get(screenId) || null;
      const presence = binding ? realtime?.presenceForScreen(screenId) : null;
      const online = presence?.online === true;
      const rawLatestMetric = metricByScreen.get(screenId) || null;
      const latestMetric = binding && rawLatestMetric && Number(rawLatestMetric.device_id) === Number(binding.device_id) ? rawLatestMetric : null;
      const problem = problemState({ binding, online, latestMetric, staleAfterMs });
      return {
        screen_id:screenId,
        screen_name:screen.name,
        label:screenLabel(screen),
        location_id:Number(screen.location_id),
        location_name:screen.location_name,
        location_number:Number(screen.location_number) || null,
        bound:Boolean(binding),
        device_id:binding ? Number(binding.device_id) : null,
        online,
        problem_code:problem?.code || null,
        problem_label:problem?.label || null,
        last_seen_at:latestSeen(binding),
        last_metric_at:latestMetric?.sampled_at || null,
        latest_metric:latestMetric ? {
          fps_avg:latestMetric.fps_avg,
          player_load_percent:latestMetric.player_load_percent,
          memory_mb:latestMetric.memory_mb,
          device_memory_gb:latestMetric.device_memory_gb,
          hardware_concurrency:latestMetric.hardware_concurrency,
          uptime_seconds:latestMetric.uptime_seconds
        } : null
      };
    });

    const requestedScreenId = positiveScreenId(request.query.screen_id);
    const selected = tvs.find((item) => item.screen_id === requestedScreenId)
      || tvs.find((item) => item.problem_code && item.bound)
      || tvs.find((item) => item.online)
      || tvs[0]
      || null;

    const points = selected?.device_id
      ? await store.dashboardPlayerMetrics({ since, bucketSeconds:range.bucketSeconds, deviceId:selected.device_id })
      : [];

    const problems = tvs.filter((item) => item.problem_code);
    const bound = bindings.length;
    const onlineCount = tvs.filter((item) => item.online).length;
    const offlineCount = tvs.filter((item) => item.bound && !item.online).length;
    const unbound = tvs.filter((item) => !item.bound).length;

    response.json({
      generated_at:new Date().toISOString(),
      range:range.key,
      summary:{
        locations:Number(counts.locations) || 0,
        screens:Number(counts.screens) || 0,
        published:Number(counts.published) || 0,
        bound,
        online:onlineCount,
        offline:offlineCount,
        unbound,
        problems:problems.length
      },
      telemetry:{
        sample_interval_seconds:Number(config?.playerMetricsIntervalSeconds) || 60,
        expected_first_sample_seconds:10,
        retention_days:Number(config?.playerMetricsRetentionDays) || 31,
        stale_after_seconds:Math.round(staleAfterMs / 1000)
      },
      tvs,
      problems,
      selected_tv:selected,
      player_metrics:{
        screen_id:selected?.screen_id || null,
        points
      }
    });
  });

  return router;
}
