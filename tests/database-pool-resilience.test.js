import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { attachDatabasePoolErrorHandler } from '../src/db/pool.js';

test('database pool idle disconnect is handled without exposing the pg client object', () => {
  const pool = new EventEmitter();
  const entries = [];
  const log = {
    warn(message, fields) {
      entries.push({ message, fields });
    }
  };

  attachDatabasePoolErrorHandler(pool, log);

  const error = new Error('Connection terminated unexpectedly');
  error.code = '57P01';
  error.client = { _poolUseCount: 100, secretKey: 12345678 };

  assert.doesNotThrow(() => {
    pool.emit('error', error, error.client);
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].message, 'PostgreSQL idle connection lost; pool will reconnect on demand');
  assert.equal(entries[0].fields.error, error);
  assert.equal(Object.hasOwn(entries[0].fields, 'client'), false);
});

test('database pool error handler is attached exactly once per configured pool', () => {
  const pool = new EventEmitter();
  const log = { warn() {} };

  attachDatabasePoolErrorHandler(pool, log);

  assert.equal(pool.listenerCount('error'), 1);
});
