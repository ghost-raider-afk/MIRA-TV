import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerTelemetryRepository } from '../src/db/player-telemetry.js';

test('canonical player telemetry repository exposes latest fullscreen state per device', async () => {
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      return {
        rows:[{
          device_id:'7',
          boot_id:'fullscreen_test',
          seq:'3',
          level:'info',
          event_type:'fullscreen.state',
          context_revision:'',
          server_received_at:'2026-10-16T05:00:00.000Z',
          metadata:JSON.stringify({ mode:'fullscreen-api', request_supported:true, fullscreen_enabled:true })
        }]
      };
    }
  };

  const repository = createPlayerTelemetryRepository(pool);
  assert.equal(typeof repository.listLatestPlayerFullscreenByDeviceIds, 'function');

  const result = await repository.listLatestPlayerFullscreenByDeviceIds([7, 7, 'bad']);
  assert.equal(result.length, 1);
  assert.equal(result[0].device_id, 7);
  assert.equal(result[0].event_type, 'fullscreen.state');
  assert.deepEqual(result[0].metadata, {
    mode:'fullscreen-api',
    request_supported:true,
    fullscreen_enabled:true
  });
  assert.match(queries[0].sql, /event_type = 'fullscreen\.state'/);
  assert.deepEqual(queries[0].params, [[7]]);
});

test('ordinary player diagnostics exclude fullscreen state records', async () => {
  const pool = {
    async query(sql) {
      assert.match(sql, /event_type <> 'fullscreen\.state'/);
      return { rows:[] };
    }
  };

  const repository = createPlayerTelemetryRepository(pool);
  const result = await repository.listLatestPlayerLogsByDeviceIds([4]);
  assert.deepEqual(result, []);
});
