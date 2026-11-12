import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createPlayerTelemetryRepository } from '../src/db/player-telemetry.js';
import { createPlayerRealtime } from '../src/realtime/player-realtime.js';
import { DEVICE_SESSION_COOKIE, tokenHash } from '../src/services/device-session-service.js';

const FROM = '2026-11-11T00:00:00.000Z';
const AT = '2026-11-12T01:20:00.000Z';

function sample(seq) {
  return {
    device_id:23, boot_id:'server-run-1', seq,
    device_timestamp:AT, server_received_at:AT,
    level:seq % 2 ? 'warn' : 'info', event_type:'connection.offline',
    context_revision:'', metadata:'{"cause":"transport_closed"}'
  };
}

test('history uses parameterized bounded per-device pagination and retains time sources', async () => {
  const calls = [];
  const pool = { async query(sql, args) {
    calls.push({ sql, args });
    if (sql.includes('COUNT(*)')) return { rows:[{ outages:2 }] };
    if (calls.filter(c => !c.sql.includes('COUNT(*)')).length === 1) {
      return { rows:[sample(3),sample(2),sample(1)] };
    }
    return { rows:[sample(1)] };
  }};
  const repository = createPlayerTelemetryRepository(pool);
  const first = await repository.getDeviceConnectionHistory(23, { since:FROM, limit:2 });
  assert.equal(first.outages, 2);
  assert.deepEqual(first.events.map(x => x.seq), [3,2]);
  assert.equal(first.events[0].device_timestamp, AT);
  assert.equal(first.events[0].server_received_at, AT);
  assert.equal(first.events[0].metadata.cause, 'transport_closed');
  assert.ok(first.next_cursor);
  const page = calls.find(c => c.sql.includes('ORDER BY'));
  assert.match(page.sql, /device_id = \$1/);
  assert.match(page.sql, /LIMIT \$3/);
  assert.deepEqual(page.args, [23, FROM, 3]);

  const second = await repository.getDeviceConnectionHistory(23, {
    since:FROM, limit:2, cursor:first.next_cursor
  });
  assert.deepEqual(second.events.map(x => x.seq), [1]);
  assert.equal(second.next_cursor, null);
  const continuation = calls.filter(c => c.sql.includes('ORDER BY'))[1];
  assert.match(continuation.sql, /LIMIT \$6/);
  assert.match(continuation.sql, /boot_id, seq\) < \(\$3::timestamptz, \$4::text, \$5::bigint\)/);
  assert.deepEqual(continuation.args, [23, FROM, AT, 'server-run-1', 2, 3]);
});

test('history rejects malformed cursors and invalid device/since values', async () => {
  const pool = { query() { throw Error('unexpected database call'); } };
  const history = createPlayerTelemetryRepository(pool);
  await assert.rejects(history.getDeviceConnectionHistory(0, { since:FROM }), /Некорректные параметры/);
  await assert.rejects(history.getDeviceConnectionHistory(23, { since:'bad' }), /Некорректные параметры/);
  await assert.rejects(history.getDeviceConnectionHistory(23, { since:FROM, cursor:'SELECT*FROM' }), /Некорректный указатель/);
  await assert.rejects(history.getDeviceConnectionHistory(23, { since:FROM, cursor:'a'.repeat(513) }), /Некорректный указатель/);
});

test('server records one connection transition per screen, ignores extra tabs and preserves close reason', async () => {
  const TOKEN = 'dvs_connection-diagnostics';
  const events = [];
  const session = { id:'session-test', device_id:23, screen_id:17 };
  const store = {
    async getActiveDeviceSessionByHash(hash) {
      return hash === tokenHash(TOKEN) ? session : null;
    },
    async insertPlayerLogBatch(deviceId, bootId, batch) {
      events.push({ deviceId, bootId, event:batch[0] });
      return batch[0].seq;
    }
  };
  const realtime = createPlayerRealtime({ store });
  const server = createServer((_, res) => res.end('ok'));
  realtime.attach(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'ws://127.0.0.1:' + server.address().port + '/ws/device';
  const sockets = [];
  async function open() {
    const socket = new WebSocket(url, { headers: {cookie:DEVICE_SESSION_COOKIE + '=' + TOKEN} });
    sockets.push(socket);
    await once(socket, 'open');
    return socket;
  }
  async function waitForCount(count) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (realtime.presenceForScreen(17).connections === count) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(realtime.presenceForScreen(17).connections, count);
  }
  try {
    const first = await open();
    const second = await open();
    await waitForCount(2);
    assert.deepEqual(events.map(x => x.event.type), ['connection.online']);
    first.close(1000, 'tab closed');
    await once(first, 'close');
    await waitForCount(1);
    assert.deepEqual(events.map(x => x.event.type), ['connection.online'], 'second open socket prevents false offline');
    second.close(1000, 'done');
    await once(second, 'close');
    await waitForCount(0);
    assert.deepEqual(events.map(x => x.event.type), ['connection.online', 'connection.offline']);
    assert.equal(events[1].event.data.close_code, 1000);
    assert.equal(events[1].event.data.cause, 'normal_close');
    assert.equal(events[1].event.level, 'warn');
    assert.equal(events[1].deviceId, 23);
    assert.match(events[0].bootId, /^server-/);
    assert.ok(events[0].event.seq < events[1].event.seq);
  } finally {
    for (const socket of sockets) socket.terminate();
    realtime.close();
    await new Promise(resolve => server.close(resolve));
  }
});
