import assert from 'node:assert/strict';
import test from 'node:test';
import { createLoginLimiter } from '../src/middleware/login-limiter.js';

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; }
  };
}

function persistentStoreMock() {
  const entries = new Map();
  const key = (scope, hash) => `${scope}:${hash}`;
  return {
    async getActiveLoginRateLimits(identityKeyHash, ipKeyHash) {
      const now = Date.now();
      return [entries.get(key('identity', identityKeyHash)), entries.get(key('ip', ipKeyHash))]
        .filter((entry) => entry && Date.parse(entry.expires_at) > now);
    },
    async recordLoginFailure({ identityKeyHash, ipKeyHash, expiresAt, now }) {
      for (const [scope, hash] of [['identity', identityKeyHash], ['ip', ipKeyHash]]) {
        const id = key(scope, hash);
        const current = entries.get(id);
        entries.set(id, current && Date.parse(current.expires_at) > Date.parse(now)
          ? { ...current, attempts: current.attempts + 1, updated_at: now }
          : { scope, key_hash: hash, attempts: 1, expires_at: expiresAt, updated_at: now });
      }
    },
    async clearLoginRateLimits(identityKeyHash, ipKeyHash) {
      entries.delete(key('identity', identityKeyHash));
      entries.delete(key('ip', ipKeyHash));
    }
  };
}

test('login limiter blocks after configured number of failures and resets on success', async () => {
  const limiter = createLoginLimiter({
    store: persistentStoreMock(),
    keySecret: 'login-limiter-test-secret'.repeat(2),
    maxAttempts: 2,
    ipMaxAttempts: 8,
    windowMinutes: 15
  });
  const request = { ip: '127.0.0.1', body: { username: 'admin' } };

  let nextCalls = 0;
  await limiter.middleware(request, responseMock(), () => { nextCalls += 1; });
  await limiter.recordFailure(request);
  await limiter.middleware(request, responseMock(), () => { nextCalls += 1; });
  await limiter.recordFailure(request);
  assert.equal(nextCalls, 2);

  const blocked = responseMock();
  await limiter.middleware(request, blocked, () => { nextCalls += 1; });
  assert.equal(blocked.statusCode, 429);
  assert.match(blocked.body.error, /Слишком много/);
  assert.ok(Number(blocked.headers['Retry-After']) >= 1);

  await limiter.recordSuccess(request);
  const allowed = responseMock();
  await limiter.middleware(request, allowed, () => { nextCalls += 1; });
  assert.equal(nextCalls, 3);
});
