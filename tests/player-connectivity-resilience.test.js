import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Player preserves rare REST liveness checks even if a Chromium WebSocket stays OPEN', async () => {
  const sync = await read('src/web/admin-ui/public/js/player/player-state-sync.js');
  assert.match(sync, /const CONNECTED_HEALTH_POLL_MS = 10 \* 60_000;/);
  assert.match(sync, /websocketConnected\s*\? Math\.max\(CONNECTED_HEALTH_POLL_MS, runtime\.fallbackPollMs\)\s*:\s*runtime\.fallbackPollMs/s);
  assert.doesNotMatch(sync, /if \(!started \|\| websocketConnected \|\| fallbackTimer\) return;/);
  assert.match(sync, /onConnected\(\) \{[\s\S]*?scheduleFallbackPoll\(\);[\s\S]*?syncNow\('websocket-reconcile'\);/);
  assert.match(sync, /onDisconnected\(\) \{[\s\S]*?clearFallbackTimer\(\);\s*scheduleFallbackPoll\(\);/);
  assert.match(sync, /onNetworkOnline\(\) \{\s*void syncNow\('network-online'\);/);
});

test('Player renews valid device sessions through regular delta traffic, without relying on metrics', async () => {
  const source = await read('src/server.js');
  assert.match(source, /app\.use\(\['\/api\/device\/session', '\/api\/device\/metrics', '\/api\/device\/player-delta'\], rotateDeviceSession\);/);
});

test('Expired authorization cannot silently delete LKG or require browser storage reset for re-pair', async () => {
  const [sync, player] = await Promise.all([
    read('src/web/admin-ui/public/js/player/player-state-sync.js'),
    read('src/web/admin-ui/public/js/player/player.js')
  ]);
  assert.match(sync, /onUnauthorized\?\.\(\{ preserveContext:true \}\);/);
  assert.match(player, /function playerReauthorizationRequired\(\) \{/);
  assert.match(player, /onUnauthorized: \(\{ preserveContext \} = \{\}\) => preserveContext \? playerReauthorizationRequired\(\) : playerUnauthorized\(\)/);
  assert.match(player, /playerMessage\.classList\.add\('is-reauthorization-required'\)/);
  assert.match(player, /playerMessage\.addEventListener\('click', openPlayerReauthorization\)/);
  assert.match(player, /playerReauthorizationRequired\(\);\s*playerStateSync\.start\(\);/);
  assert.match(player, /function openPlayerReauthorization\(event\) \{[\s\S]*?showPairingIntro\(\);/);
  assert.match(player, /if \(state === 'online'\) \{[\s\S]*?classList\.remove\('is-reauthorization-required'\)/);
});
