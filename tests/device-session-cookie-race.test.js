import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import { createDevicePublicRouter } from '../src/api/device/public-routes.js';

const config = Object.freeze({
  deviceActivationMaxAttempts:10,
  deviceActivationWindowMinutes:15,
  deviceActivationLimiterMaxEntries:1000,
  deviceSessionTtlDays:30,
  secureCookies:false
});

async function withSessionEndpoint(revoked, callback) {
  const store = {
    async getActiveDeviceSessionByHash() { return null; },
    async isRevokedDeviceSessionByHash() { return revoked; }
  };
  const app = express();
  app.use('/api/device', createDevicePublicRouter({ store, config }));
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    return await callback(async (cookie) => fetch(`http://127.0.0.1:${address.port}/api/device/session`, {
      headers:{ cookie }
    }));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('rotated predecessor 401 cannot erase a newer HttpOnly TV session cookie', async () => {
  await withSessionEndpoint(false, async (request) => {
    const response = await request('mira_tv_device_session=dvs_rotated_parent');
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('x-mira-device-revoked'), null);
    assert.equal(response.headers.get('set-cookie'), null,
      'a delayed response to the old cookie must not expire the new cookie');
    assert.deepEqual(await response.json(), { authorized:false });
  });
});

test('expired or unknown token does not erase the cookie of a concurrent session handoff', async () => {
  await withSessionEndpoint(false, async (request) => {
    const response = await request('mira_tv_device_session=dvs_expired_session');
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('set-cookie'), null);
  });
});

test('confirmed administrator revocation still expires the TV cookie and signals local wipe', async () => {
  await withSessionEndpoint(true, async (request) => {
    const response = await request('mira_tv_device_session=dvs_admin_revoked');
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('x-mira-device-revoked'), '1');
    assert.match(response.headers.get('set-cookie') || '',
      /mira_tv_device_session=;.*Max-Age=0/);
  });
});
