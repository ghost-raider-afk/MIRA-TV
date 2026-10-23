import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../src/web/admin-ui/public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../src/web/admin-ui/public/js/pages/dashboard.js',import.meta.url),'utf8');
const nav=readFileSync(new URL('../src/web/admin-ui/public/js/core/navigation.js',import.meta.url),'utf8');

test('Monitoring preserves existing route while renaming the visible page',()=>{
  assert.match(nav,/path: '\/', page: 'overview', section: 'overview', title: 'Мониторинг'/);
  assert.match(nav,/label: 'Мониторинг', href: '\/'/);
  assert.match(html,/<h1>Мониторинг<\/h1>/);
  assert.match(html,/dashboard-operations-grid/);
});
test('all three SVG graphs expose numeric and time ticks; uptime contains no graph',()=>{
  assert.equal((js.match(/id:'(?:fps|load|memory)', key:/g)||[]).length,3);
  assert.match(js,/dashboard-chart-axis-label/);
  assert.match(js,/axisTime\(start \+ duration \* index \/ 4\)/);
  assert.match(js,/if \(!point\) \{ finishSegment\(\); previous = null; continue; \}/);
  assert.match(js,/renderUptimeCard\(uptime, points, selectedTv\)/);
  const uptime=html.match(/data-dashboard-card="uptime"[\s\S]*?<\/article>/)?.[0];
  assert.ok(uptime);
  assert.doesNotMatch(uptime,/data-dashboard-chart/);
  assert.match(uptime,/data-dashboard-uptime-last/);
});
