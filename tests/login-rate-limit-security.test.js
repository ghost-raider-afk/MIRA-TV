import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { migrateLoginRateLimits } from '../src/db/migrations/login-rate-limits.js';
import { createLoginRateLimitsRepository } from '../src/db/login-rate-limits.js';
import { createLoginLimiter } from '../src/middleware/login-limiter.js';

function request(ip, username) {
  return { ip, body: { username }, socket: { remoteAddress: ip } };
}

async function runMiddleware(limiter, req) {
  const result = { next: false, status: null, body: null, headers: {} };
  const response = {
    setHeader(name, value) { result.headers[name] = value; },
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; }
  };
  await limiter.middleware(req, response, () => { result.next = true; });
  return result;
}

function limiter(store, overrides = {}) {
  return createLoginLimiter({
    store,
    keySecret: 'persistent-login-test-secret'.repeat(2),
    maxAttempts: 2,
    ipMaxAttempts: 4,
    windowMinutes: 15,
    ...overrides
  });
}

test('login failures survive limiter recreation and successful login clears only matching persistent keys', async () => {
  const memoryDb = newDb();
  const { Pool } = memoryDb.adapters.createPg();
  const pool = new Pool();
  try {
    await migrateLoginRateLimits(pool);
    const store = createLoginRateLimitsRepository(pool);
    const firstLimiter = limiter(store);
    const req = request('203.0.113.10', 'Admin');

    assert.equal((await runMiddleware(firstLimiter, req)).next, true);
    await firstLimiter.recordFailure(req);
    await firstLimiter.recordFailure(req);

    const restartedLimiter = limiter(store);
    const blocked = await runMiddleware(restartedLimiter, request('203.0.113.10', 'admin'));
    assert.equal(blocked.status, 429);
    assert.match(String(blocked.headers['Retry-After']), /^\d+$/);

    await restartedLimiter.recordSuccess(request('203.0.113.10', 'admin'));
    assert.equal((await runMiddleware(limiter(store), request('203.0.113.10', 'admin'))).next, true);

    const { rows } = await pool.query('SELECT key_hash FROM login_rate_limits');
    assert.equal(rows.some((row) => row.key_hash.includes('203.0.113.10') || row.key_hash.includes('admin')), false);
  } finally {
    await pool.end();
  }
});

test('persistent limiter blocks password spraying across usernames from one IP', async () => {
  const memoryDb = newDb();
  const { Pool } = memoryDb.adapters.createPg();
  const pool = new Pool();
  try {
    await migrateLoginRateLimits(pool);
    const store = createLoginRateLimitsRepository(pool);
    const activeLimiter = limiter(store, { maxAttempts: 99, ipMaxAttempts: 3 });
    for (const username of ['first', 'second', 'third']) {
      await activeLimiter.recordFailure(request('198.51.100.44', username));
    }
    const blocked = await runMiddleware(limiter(store, { maxAttempts: 99, ipMaxAttempts: 3 }), request('198.51.100.44', 'fourth'));
    assert.equal(blocked.status, 429);
  } finally {
    await pool.end();
  }
});

test('Traefik applies dedicated flood limits only to login and initial TV activation', async () => {
  const compose = await readFile('compose.yaml', 'utf8');
  assert.match(compose, /mira-tv-login-rate-limit/);
  assert.match(compose, /Path\(\\140\/api\/auth\/login\\140\).*Method\(\\140POST\\140\)/);
  assert.match(compose, /mira-tv-device-activation-rate-limit/);
  assert.match(compose, /Path\(\\140\/api\/device\/activations\\140\).*Method\(\\140POST\\140\)/);
  assert.match(compose, /average: 30\\n        period: 1m\\n        burst: 10/);
  assert.match(compose, /average: 120\\n        period: 1m\\n        burst: 40/);
  assert.match(compose, /mira-tv:\\n      rule: \"Host\(\\140%s\\140\)\"/);
});
