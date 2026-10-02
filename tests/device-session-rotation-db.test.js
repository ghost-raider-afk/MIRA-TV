import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { initialiseSchema } from '../src/db/migrations/schema.js';
import { migrateDevicePlayer } from '../src/db/migrations/device-player.js';
import { migrateDeviceBindings } from '../src/db/migrations/device-bindings.js';
import { migrateDeviceIdentification } from '../src/db/migrations/device-identification.js';
import { migrateDeviceSessionRotation } from '../src/db/migrations/device-session-rotation.js';
import { createDevicesRepository } from '../src/db/devices.js';
import { createDeviceSessionRotationRepository } from '../src/db/device-session-rotation.js';

async function seedScreen(pool) {
  const now = new Date().toISOString();
  const location = await pool.query(
    `INSERT INTO locations (name, address, active, created_at, updated_at)
     VALUES ($1, '', TRUE, $2, $2) RETURNING id`,
    [`Точка ${crypto.randomUUID()}`, now]
  );
  const screen = await pool.query(
    `INSERT INTO screens (location_id, location_number, name, resolution, status, active, created_at, updated_at)
     VALUES ($1, 1, $2, '1920×1080', 'published', TRUE, $3, $3) RETURNING id`,
    [location.rows[0].id, `ТВ ${crypto.randomUUID()}`, now]
  );
  return Number(screen.rows[0].id);
}

test('TV session rotation keeps the same device and monitor binding and revokes only the parent token', async () => {
  const memoryDb = newDb({ autoCreateForeignKeyIndices: true });
  const { Pool } = memoryDb.adapters.createPg();
  const pool = new Pool();
  try {
    await initialiseSchema(pool);
    await migrateDevicePlayer(pool);
    await migrateDeviceBindings(pool);
    await migrateDeviceIdentification(pool);
    await migrateDeviceSessionRotation(pool);

    const devices = createDevicesRepository(pool);
    const rotation = createDeviceSessionRotationRepository(pool);
    const screenId = await seedScreen(pool);
    const device = await devices.bindDevice({
      deviceKey: crypto.randomUUID(),
      screenId,
      label: 'ТВ 1',
      authorizedBy: 'admin'
    });

    const parentSessionId = crypto.randomUUID();
    const parentTokenHash = crypto.randomBytes(32).toString('hex');
    await devices.createDeviceSession({
      id: parentSessionId,
      deviceId: device.id,
      tokenHash: parentTokenHash,
      expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString()
    });

    const candidateSessionId = crypto.randomUUID();
    const childTokenHash = crypto.randomBytes(32).toString('hex');
    const child = await rotation.beginOrResumeDeviceSessionRotation({
      parentSessionId,
      deviceId: device.id,
      candidateSessionId,
      candidateTokenHash: childTokenHash,
      expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString()
    });
    assert.equal(child.session_id, candidateSessionId);
    assert.equal(child.parent_session_id, parentSessionId);
    assert.equal(child.device_id, device.id);

    const resumed = await rotation.beginOrResumeDeviceSessionRotation({
      parentSessionId,
      deviceId: device.id,
      candidateSessionId: crypto.randomUUID(),
      candidateTokenHash: crypto.randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString()
    });
    assert.equal(resumed.session_id, candidateSessionId, 'parallel/retried rotation reuses one pending child session');

    const beforeConfirm = await devices.getActiveDeviceBindingByScreen(screenId);
    assert.equal(beforeConfirm.device_id, device.id);
    assert.ok(await devices.getActiveDeviceSessionByHash(parentTokenHash));
    const childSession = await devices.getActiveDeviceSessionByHash(childTokenHash);
    assert.equal(childSession.device_id, device.id);
    assert.equal(childSession.screen_id, screenId);

    assert.equal(await rotation.confirmDeviceSessionRotation(candidateSessionId, parentSessionId, device.id), true);
    assert.equal(await devices.getActiveDeviceSessionByHash(parentTokenHash), null);
    const activeChild = await devices.getActiveDeviceSessionByHash(childTokenHash);
    assert.equal(activeChild.device_id, device.id);
    assert.equal(activeChild.screen_id, screenId);

    const afterConfirm = await devices.getActiveDeviceBindingByScreen(screenId);
    assert.equal(afterConfirm.device_id, device.id, 'rotation must never unbind or replace the physical TV');
    assert.equal(afterConfirm.binding_id, beforeConfirm.binding_id, 'monitor binding identity must remain unchanged');
  } finally {
    await pool.end();
  }
});
