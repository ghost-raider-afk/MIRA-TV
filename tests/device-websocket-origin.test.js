import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { WebSocket } from 'ws';
import { createPlayerRealtime } from '../src/realtime/player-realtime.js';
import { DEVICE_SESSION_COOKIE, tokenHash } from '../src/services/device-session-service.js';

const TOKEN = 'dvs_realtime-session-test-token';
const SCREEN_ID = 17;
const DEVICE_ID = 23;

function rejectedUpgrade(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers });
    socket.once('open', () => {
      socket.close();
      reject(new Error('unauthorized WebSocket unexpectedly opened'));
    });
    socket.once('unexpected-response', (_request, response) => {
      const status = response.statusCode;
      response.resume();
      resolve(status);
    });
    socket.on('error', () => {});
  });
}

function nextJson(socket) {
  return once(socket, 'message').then(([data]) => JSON.parse(String(data)));
}

test('device WebSocket upgrade is authorized by active Device Session, independent of proxy origin metadata', async () => {
  const activeHash = tokenHash(TOKEN);
  const store = {
    async getActiveDeviceSessionByHash(hash) {
      if (hash !== activeHash) return null;
      return { id:'session-1', device_id:DEVICE_ID, screen_id:SCREEN_ID };
    }
  };
  const realtime = createPlayerRealtime({ store });
  const server = createServer((_request, response) => response.end('ok'));
  realtime.attach(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const url = `ws://127.0.0.1:${address.port}/ws/device`;

  try {
    assert.equal(await rejectedUpgrade(url), 401, 'missing Device Session must be rejected');
    assert.equal(await rejectedUpgrade(url, {
      cookie:`${DEVICE_SESSION_COOKIE}=stale-token`
    }), 401, 'inactive Device Session must be rejected');

    const socket = new WebSocket(url, {
      headers: {
        cookie:`${DEVICE_SESSION_COOKIE}=${encodeURIComponent(TOKEN)}`,
        origin:'https://foreign.example.test',
        'x-forwarded-host':'proxy.internal',
        'x-forwarded-proto':'wss'
      }
    });
    socket.on('error', () => {});
    const ready = nextJson(socket);
    await once(socket, 'open');
    assert.deepEqual(await ready, { type:'ready', screen_id:SCREEN_ID });

    assert.deepEqual(realtime.presenceForScreen(SCREEN_ID), {
      online:true,
      connections:1,
      connected_at:realtime.presenceForScreen(SCREEN_ID).connected_at,
      realtime_last_seen_at:realtime.presenceForScreen(SCREEN_ID).realtime_last_seen_at
    });

    const previewRequest = nextJson(socket);
    assert.equal(realtime.requestScreenPreview(SCREEN_ID), 1);
    assert.deepEqual(await previewRequest, { type:'preview.request' });

    socket.close(1000, 'test complete');
    await once(socket, 'close');
  } finally {
    realtime.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
