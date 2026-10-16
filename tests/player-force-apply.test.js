import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const adminRoutes = readFileSync('src/api/device/admin-routes.js', 'utf8');
const realtime = readFileSync('src/realtime/player-realtime.js', 'utf8');
const realtimeClient = readFileSync('src/web/admin-ui/public/js/player/player-realtime-client.js', 'utf8');

test('Apply to TV uses acknowledged soft reprovision instead of blind force-render reload', () => {
  assert.match(
    adminRoutes,
    /requestReprovision\?\.\(screenId, revision\.revision, commandId\)/,
    'admin Apply must request the persistent soft reprovision protocol'
  );
  assert.doesNotMatch(
    adminRoutes,
    /notifyScreen\(screenId, revision\.revision, \{ forceRender:true \}\)/,
    'admin Apply must not blindly reload the currently cached Player shell'
  );
  assert.match(realtime, /force_reprovision:state\.commandId/);
  assert.match(realtime, /message\?\.type === 'reprovision\.ack'/);
  assert.match(realtime, /status:state\.completedAt \? 'completed'/);
  assert.match(realtime, /requestScreenPreview\(id\)/);
  assert.match(realtimeClient, /location\.replace\(recoveryUrl\(reprovision\)\)/);
  assert.match(realtimeClient, /type:'reprovision\.ack'/);
});
