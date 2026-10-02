import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { initialiseSchema } from '../src/db/migrations/schema.js';
import { migrateWebSessions } from '../src/db/migrations/web-sessions.js';
import { createUsersRepository } from '../src/db/users.js';
import {
  createSessionCredentials,
  createSessionResolver,
  SESSION_COOKIE,
  sessionCookie,
  verifySession
} from '../src/services/session-service.js';

const config = Object.freeze({
  sessionSecret: 's'.repeat(48),
  sessionTtlHours: 12,
  secureCookies: true
});

function requestFor(token) {
  return { headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` } };
}

async function seedUser(pool, username = `user-${crypto.randomUUID()}`) {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO web_users
      (username, password_hash, role, active, session_version, password_changed_at, created_at, updated_at)
     VALUES ($1, 'hash', 'administrator', TRUE, 1, $2, $2, $2)`,
    [username, now]
  );
  return username;
}

test('server-backed web sessions can revoke one browser without revoking another', async () => {
  const memoryDb = newDb({ autoCreateForeignKeyIndices: true });
  const { Pool } = memoryDb.adapters.createPg();
  const pool = new Pool();
  try {
    await initialiseSchema(pool);
    await migrateWebSessions(pool);
    const store = createUsersRepository(pool);
    const username = await seedUser(pool);
    const user = await store.getActiveUser(username);
    const first = createSessionCredentials(user, config);
    const second = createSessionCredentials(user, config);

    await store.createWebSession({
      tokenHash: first.tokenHash,
      username,
      sessionVersion: user.session_version,
      expiresAt: first.expiresAt
    });
    await store.createWebSession({
      tokenHash: second.tokenHash,
      username,
      sessionVersion: user.session_version,
      expiresAt: second.expiresAt
    });

    const resolve = createSessionResolver(store, config);
    assert.equal((await resolve(requestFor(first.token)))?.sub, username);
    assert.equal((await resolve(requestFor(second.token)))?.sub, username);

    assert.equal(await store.revokeWebSessionByHash(first.tokenHash), true);
    assert.equal(await resolve(requestFor(first.token)), null);
    assert.equal((await resolve(requestFor(second.token)))?.sub, username);
  } finally {
    await pool.end();
  }
});

test('password session_version change invalidates all old server-backed sessions and allows a new one', async () => {
  const memoryDb = newDb({ autoCreateForeignKeyIndices: true });
  const { Pool } = memoryDb.adapters.createPg();
  const pool = new Pool();
  try {
    await initialiseSchema(pool);
    await migrateWebSessions(pool);
    const store = createUsersRepository(pool);
    const username = await seedUser(pool);
    const original = await store.getActiveUser(username);
    const oldCredentials = createSessionCredentials(original, config);
    await store.createWebSession({
      tokenHash: oldCredentials.tokenHash,
      username,
      sessionVersion: original.session_version,
      expiresAt: oldCredentials.expiresAt
    });

    const resolve = createSessionResolver(store, config);
    assert.equal((await resolve(requestFor(oldCredentials.token)))?.sub, username);

    const updated = await store.updateUserPassword(username, 'new-hash');
    assert.equal(updated.session_version, original.session_version + 1);
    assert.equal(await resolve(requestFor(oldCredentials.token)), null);

    await store.revokeWebSessionsForUser(username);
    const fresh = createSessionCredentials(updated, config);
    await store.createWebSession({
      tokenHash: fresh.tokenHash,
      username,
      sessionVersion: updated.session_version,
      expiresAt: fresh.expiresAt
    });
    assert.equal((await resolve(requestFor(fresh.token)))?.sub, username);
  } finally {
    await pool.end();
  }
});

test('legacy stateless cookies without sid are rejected after the migration', () => {
  const payload = Buffer.from(JSON.stringify({
    sub: 'admin',
    version: 1,
    exp: Math.floor(Date.now() / 1000) + 3600
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
  assert.equal(verifySession(`${payload}.${signature}`, config), null);
});

test('session cookie remains HttpOnly, strict and secure', () => {
  const user = { username: 'admin', session_version: 1 };
  const credentials = createSessionCredentials(user, config);
  const cookie = sessionCookie(credentials.token, config);
  assert.match(cookie, /^mira_tv_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
});
