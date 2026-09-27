import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Dashboard exposes per-TV telemetry ranges', async () => {
  const [html, dashboard, routes] = await Promise.all([
    read('src/web/admin-ui/public/index.html'),
    read('src/web/admin-ui/public/js/pages/dashboard.js'),
    read('src/api/overview/routes.js')
  ]);
  for (const range of ['1h','24h','7d','30d']) {
    assert.ok(html.includes('data-dashboard-range="' + range + '"'));
    assert.ok(routes.includes("'" + range + "'") || routes.includes('"' + range + '"'));
  }
  assert.match(dashboard, /selectedScreenId/);
  assert.match(routes, /problems/);
  assert.match(routes, /selected_tv/);
});

test('telemetry remains available but is lazy-loaded after the first TV frame', async () => {
  const [collector, player, background, routes, context] = await Promise.all([
    read('src/web/admin-ui/public/js/player/player-metrics.js'),
    read('src/web/admin-ui/public/js/player/player.js'),
    read('src/web/admin-ui/public/js/player/player-background-services.js'),
    read('src/api/device/public-routes.js'),
    read('src/services/player-context-service.js')
  ]);
  assert.match(collector, /PerformanceObserver/);
  assert.match(collector, /requestAnimationFrame/);
  assert.doesNotMatch(player, /^import .*player-metrics/m);
  assert.match(player, /import\('\.\/player-background-services\.js'\)/);
  assert.match(background, /createPlayerMetricsCollector/);
  assert.match(routes, /router\.post\('\/metrics'/);
  assert.match(context, /metrics_interval_ms/);
});
