import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SftpGoClient } from '../src/sftp/client.js';
import { SftpStorage } from '../src/sftp/storage.js';

test('SFTPGo management requests fail with a bounded timeout', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options = {}) => new Promise((_resolve, reject) => {
    const signal = options.signal;
    if (signal?.aborted) return reject(signal.reason);
    signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  try {
    const client = new SftpGoClient({
      apiUrl: 'http://sftp.test',
      apiTimeoutMs: 25,
      adminUsername: 'admin',
      adminPassword: 'secret'
    });
    await assert.rejects(
      client.createReadOnlyUser({ username: 'point', password: 'password', homeDir: '/srv/point' }),
      (error) => error?.status === 504 && /не ответил/.test(error.message)
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('staging cleanup removes only unreferenced keys', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'menu-tv-sftp-storage-'));
  const storage = new SftpStorage(root);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0xff, 0xd9]);
  try {
    const keep = await storage.stageJpeg(1, jpeg);
    const remove = await storage.stageJpeg(2, jpeg);
    const result = await storage.cleanupStaging([keep.key], { maxAgeMs: 0 });
    assert.equal(result.removed, 1);
    await stat(storage.stagedPath(keep.key));
    await assert.rejects(stat(storage.stagedPath(remove.key)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('unsafe staging keys are rejected before any filesystem access', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'menu-tv-sftp-storage-'));
  const storage = new SftpStorage(root);
  try {
    assert.throws(() => storage.stagedPath('../outside.jpg'), /Недопустимый/);
    await assert.rejects(() => storage.removeStaged('../outside.jpg'), /Недопустимый/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
