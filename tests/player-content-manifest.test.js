import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildPlayerContentManifest } from '../src/services/player-content-manifest-service.js';

test('Player content manifest deduplicates shared assets and keeps content identity', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mira-player-manifest-'));
  try {
    const hash = 'a'.repeat(64);
    const url = `/site-assets/content/asset-${hash}.png`;
    const directory = path.join(root, 'content');
    await mkdir(directory, { recursive:true });
    await writeFile(path.join(directory, `asset-${hash}.png`), Buffer.from('asset-bytes'));

    const manifest = await buildPlayerContentManifest({
      renderRevision: 42,
      config:{ siteAssetsRoot:root },
      draft:{ settings:{ background_image_url:url } },
      scene:{
        version:1,
        elements:[
          { id:'shared', type:'image', enabled:true, media:{ source_url:url } },
          { id:'off', type:'video', enabled:false, media:{ source_url:'/site-assets/content/asset-' + 'b'.repeat(64) + '.mp4' } }
        ]
      }
    });

    assert.equal(manifest.version, 1);
    assert.equal(manifest.revision, '42');
    assert.equal(manifest.assets.length, 1);
    assert.equal(manifest.assets[0].url, url);
    assert.equal(manifest.assets[0].content_hash, hash);
    assert.equal(manifest.assets[0].size_bytes, Buffer.byteLength('asset-bytes'));
    assert.deepEqual(manifest.assets[0].roles, ['background', 'image']);
    assert.equal(manifest.assets[0].required, true);
  } finally {
    await rm(root, { recursive:true, force:true });
  }
});
