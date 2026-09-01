import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Player realtime is WebSocket-based and reconnects without polling while network is offline', async () => {
  const [client, hub] = await Promise.all([
    read('src/web/admin-ui/public/js/player/player-realtime-client.js'),
    read('src/realtime/player-realtime.js')
  ]);

  assert.match(client, /new WebSocket\(`\$\{protocol\}\/\/\$\{location\.host\}\/ws\/device`\)/);
  assert.match(client, /const BACKOFF_MS = \[1000, 2000, 4000, 8000, 15000, 30000\]/);
  assert.match(client, /if \(stopped \|\| retryTimer \|\| !navigator\.onLine\) return/);
  assert.match(client, /window\.addEventListener\('online', handleOnline\)/);
  assert.match(client, /window\.addEventListener\('offline', handleOffline\)/);

  assert.match(hub, /new WebSocketServer\(\{ noServer: true, perMessageDeflate: false, maxPayload: 4096 \}\)/);
  assert.match(hub, /url\.pathname !== '\/ws\/device'/);
  assert.match(hub, /getActiveDeviceSessionByHash/);
  assert.match(hub, /\{ type: 'context\.changed', revision:/);
  assert.match(hub, /HEARTBEAT_MS = 60_000/);
});

test('network restoration immediately reconciles state and flushes queued Player logs independently of WebSocket', async () => {
  const sync = await read('src/web/admin-ui/public/js/player/player-state-sync.js');

  assert.match(sync, /'entity', 'brand', 'announcement', 'scene', 'runtime'/);
  assert.match(sync, /function scheduleFallbackPoll\(\) \{\s*if \(!started \|\| websocketConnected \|\| fallbackTimer \|\| !navigator\.onLine\) return/);
  assert.match(sync, /window\.addEventListener\('online', handleNetworkOnline\)/);
  assert.match(sync, /window\.addEventListener\('offline', handleNetworkOffline\)/);
  assert.match(sync, /async function handleNetworkOnline\(\)/);
  assert.match(sync, /await log\('network\.online'\)/);
  assert.match(sync, /syncNow\('network-online'\)/);
  assert.match(sync, /await log\('network\.reconciled'/);
  assert.match(sync, /scheduleLogFlush\(0\)/);
  assert.match(sync, /function handleNetworkOffline\(\)/);
  assert.match(sync, /log\('network\.offline', \{\}, 'warn'\)/);
  assert.match(sync, /clearFallbackTimer\(\)/);
});

test('log writes are serialized before upload and failed upload is retried', async () => {
  const sync = await read('src/web/admin-ui/public/js/player/player-state-sync.js');

  assert.match(sync, /const LOG_RETRY_MS = 5_000/);
  assert.match(sync, /let logWritePromise = Promise\.resolve\(\)/);
  assert.match(sync, /logWritePromise = logWritePromise\s*\.then\(\(\) => appendPlayerLog/);
  assert.match(sync, /await logWritePromise;\s*for \(let index = 0;/);
  assert.match(sync, /pendingPlayerLogs\(runtime\.logBatchSize\)/);
  assert.match(sync, /fetch\('\/api\/device\/player-logs'/);
  assert.match(sync, /acknowledgePlayerLogs\(batchBootId, body\.accepted_through\)/);
  assert.match(sync, /catch\(\(\) => \{\s*if \(started && navigator\.onLine && logFlushNeeded\) scheduleLogFlush\(LOG_RETRY_MS\)/);
});

test('offline Player logs survive locally and server ingestion is idempotent', async () => {
  const [store, repository, routes] = await Promise.all([
    read('src/web/admin-ui/public/js/player/player-store.js'),
    read('src/db/player-telemetry.js'),
    read('src/api/device/public-routes.js')
  ]);

  assert.match(store, /const DB_NAME = 'mira-tv-player'/);
  assert.match(store, /const LOG_STORE = 'logs'/);
  assert.match(store, /logs\.createIndex\('boot_seq', \['boot_id', 'seq'\], \{ unique: true \}\)/);
  assert.match(store, /export async function appendPlayerLog/);
  assert.match(store, /export async function pendingPlayerLogs/);
  assert.match(store, /export async function acknowledgePlayerLogs/);
  assert.match(store, /cursor\.delete\(\)/);

  assert.match(repository, /ON CONFLICT \(device_id, boot_id, seq\) DO NOTHING/);
  assert.match(repository, /acceptedThrough = Math\.max\(acceptedThrough, event\.seq\)/);
  assert.match(routes, /const PLAYER_COMPONENTS = new Set\(\[[^\]]*'scene'[^\]]*\]\)/);
  assert.match(routes, /router\.post\('\/player-logs'/);
  assert.match(routes, /response\.status\(202\)\.json\(\{ boot_id: batch\.bootId, accepted_through: acceptedThrough \}\)/);
});

test('published Scene runtime is part of the offline Player shell', async () => {
  const worker = await read('src/web/admin-ui/public/player-sw.js');
  assert.match(worker, /mira-tv-player-shell-v16-scene4/);
  for (const asset of [
    '/css/scene-renderer.css',
    '/js/player/published-scene-runtime.js',
    '/js/scene-runtime/renderer.js',
    '/js/scene-runtime/animation.js',
    '/js/scenes/catalog-table.js'
  ]) {
    assert.ok(worker.includes(`'${asset}'`), `offline Scene shell is missing ${asset}`);
  }
});
