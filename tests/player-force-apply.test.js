import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const adminRoutes = readFileSync('src/api/device/admin-routes.js', 'utf8');
const realtime = readFileSync('src/realtime/player-realtime.js', 'utf8');
const realtimeClient = readFileSync('src/web/admin-ui/public/js/player/player-realtime-client.js', 'utf8');

test('Apply to TV uses an explicit one-shot force-render realtime protocol', () => {
  assert.match(
    adminRoutes,
    /notifyScreen\(screenId, revision\.revision, \{ forceRender:true \}\)/,
    'admin Apply must distinguish a force render from an ordinary context change'
  );
  assert.match(realtime, /function notifyScreen\(screenId, revision = '', \{ forceRender = false \} = \{\}\)/);
  assert.match(realtime, /force_render:true/);
  assert.match(realtime, /previewOnNextConnect\.add\(id\)/);
  assert.match(realtime, /previewOnNextConnect\.delete\(screenId\)/);
  assert.match(realtimeClient, /message\.force_render === true/);
  assert.match(realtimeClient, /location\.reload\(\)/);
});
