import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { replaceEntityAssetStream } from '../src/services/entity-assets-service.js';

function expectPayloadTooLarge(error) {
  assert.equal(error?.status, 413);
  assert.equal(error?.code, 'payload_too_large');
  assert.match(error?.message || '', /Entity.*допустимый размер/i);
  return true;
}

test('Entity upload rejects an oversized declared Content-Length before creating files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mira-entity-limit-'));
  try {
    await assert.rejects(
      replaceEntityAssetStream({
        stream: Readable.from([Buffer.from('x')]),
        contentLength: '104857601',
        contentType: 'video/mp4',
        config: { entityAssetMaxBytes: 104857600, siteAssetsRoot: root },
        store: {},
        username: 'admin'
      }),
      expectPayloadTooLarge
    );
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Entity upload enforces the same limit for streamed bodies without Content-Length and removes partial files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mira-entity-stream-'));
  try {
    await assert.rejects(
      replaceEntityAssetStream({
        stream: Readable.from([Buffer.alloc(5), Buffer.alloc(5)]),
        contentType: 'video/webm',
        config: { entityAssetMaxBytes: 8, siteAssetsRoot: root },
        store: {},
        username: 'admin'
      }),
      expectPayloadTooLarge
    );
    assert.deepEqual(await readdir(path.join(root, 'entities')), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
