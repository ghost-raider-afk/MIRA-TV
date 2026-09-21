import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Overview is logo-only navigation and dashboard exposes TrueNAS-style ranges', async () => {
  const [navigation, sidebar, html, dashboard, overviewRoutes] = await Promise.all([
    read('src/web/admin-ui/public/js/core/navigation.js'),
    read('src/web/admin-ui/public/js/components/sidebar.js'),
    read('src/web/admin-ui/public/index.html'),
    read('src/web/admin-ui/public/js/pages/dashboard.js'),
    read('src/api/overview/routes.js')
  ]);

  assert.match(navigation, /overview:\s*Object\.freeze\(\[\]\)/);
  assert.doesNotMatch(sidebar, /MOBILE_OVERVIEW_ROUTE/);
  assert.match(sidebar, /class="ui-rail-brand" href="\/"/);
  for (const range of ['1h','24h','7d','30d']) {
    assert.match(html, new RegExp(`data-dashboard-range="${range}"`));
    assert.ok(overviewRoutes.includes(`'${range}'`) || overviewRoutes.includes(`"${range}"`));
  }
  assert.match(dashboard, /dashboard-sparkline/);
  assert.match(dashboard, /player_load_percent/);
  assert.match(dashboard, /memory_mb/);
  assert.match(dashboard, /fps_avg/);
  assert.match(dashboard, /online_tvs/);
});

test('Player metrics use sampled browser performance data and dedicated history storage', async () => {
  const [migration, repository, collector, player, routes, context, config, server] = await Promise.all([
    read('src/db/migrations/player-metrics.js'),
    read('src/db/player-metrics.js'),
    read('src/web/admin-ui/public/js/player/player-metrics.js'),
    read('src/web/admin-ui/public/js/player/player.js'),
    read('src/api/device/public-routes.js'),
    read('src/services/player-context-service.js'),
    read('src/config/index.js'),
    read('src/server.js')
  ]);

  assert.match(migration, /CREATE TABLE IF NOT EXISTS tv_player_metrics/);
  assert.match(repository, /dashboardPlayerMetrics/);
  assert.match(repository, /date_bin/);
  assert.match(repository, /COUNT\(DISTINCT device_id\)/);
  assert.match(collector, /PerformanceObserver/);
  assert.match(collector, /requestAnimationFrame/);
  assert.match(collector, /usedJSHeapSize/);
  assert.match(collector, /hardwareConcurrency/);
  assert.match(collector, /fetch\(endpoint/);
  assert.match(player, /createPlayerMetricsCollector/);
  assert.match(routes, /router\.post\('\/metrics'/);
  assert.match(context, /metrics_interval_ms/);
  assert.match(config, /PLAYER_METRICS_INTERVAL_SECONDS/);
  assert.match(config, /PLAYER_METRICS_RETENTION_DAYS/);
  assert.match(server, /cleanupPlayerMetrics/);
});
