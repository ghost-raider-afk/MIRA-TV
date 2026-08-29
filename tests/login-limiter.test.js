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

test('login limiter blocks after configured number of failures and resets on success', () => {
  const limiter = createLoginLimiter({ maxAttempts: 2, windowMinutes: 15, maxEntries: 100 });
  const request = { ip: '127.0.0.1', body: { username: 'admin' } };

  let nextCalls = 0;
  limiter.middleware(request, responseMock(), () => { nextCalls += 1; });
  limiter.recordFailure(request);
  limiter.middleware(request, responseMock(), () => { nextCalls += 1; });
  limiter.recordFailure(request);
  assert.equal(nextCalls, 2);

  const blocked = responseMock();
  limiter.middleware(request, blocked, () => { nextCalls += 1; });
  assert.equal(blocked.statusCode, 429);
  assert.match(blocked.body.error, /Слишком много/);
  assert.ok(Number(blocked.headers['Retry-After']) >= 1);

  limiter.recordSuccess(request);
  const allowed = responseMock();
  limiter.middleware(request, allowed, () => { nextCalls += 1; });
  assert.equal(nextCalls, 3);
});
