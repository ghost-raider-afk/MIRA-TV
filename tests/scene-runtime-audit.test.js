import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { sceneInput } from '../src/contracts/scene.js';
import { cleanupUnreferencedSceneAssets, deleteSceneAsset } from '../src/services/scene-assets-service.js';

function baseElement(id, type) {
  return { id, type, enabled:true, x:0, y:0, width:320, height:180, z_index:0, opacity:1, rotation_deg:0 };
}

test('scene owns only one weather element', () => {
  const weather = (id) => ({ ...baseElement(id, 'weather'), weather:{ latitude:60, longitude:25 } });
  assert.throws(
    () => sceneInput({ version:1, elements:[weather('w1'), weather('w2')] }),
    /только один элемент «Погода»/
  );
});

test('scene limits simultaneous video decoders', () => {
  const video = (id, enabled=true) => ({ ...baseElement(id, 'video'), enabled, media:{ source_url:'', fit:'contain', position_x_percent:50, position_y_percent:50, loop:true, muted:true, playback_rate:1 } });
  assert.doesNotThrow(() => sceneInput({ version:1, elements:[video('v1'), video('v2'), video('v3', false)] }));
  assert.throws(
    () => sceneInput({ version:1, elements:[video('v1'), video('v2'), video('v3')] }),
    /не более 2 видеоэлементов/
  );
});

test('scene asset cleanup keeps referenced files and removes expired orphans', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mira-scene-assets-'));
  const directory = path.join(root, 'scene');
  await mkdir(directory, { recursive:true });
  const keep = 'scene-11111111-1111-4111-8111-111111111111.png';
  const orphan = 'scene-22222222-2222-4222-8222-222222222222.webp';
  await writeFile(path.join(directory, keep), 'keep');
  await writeFile(path.join(directory, orphan), 'orphan');

  const keepUrl = '/site-assets/scene/' + keep;
  const orphanUrl = '/site-assets/scene/' + orphan;
  const store = {
    async listSceneAssetReferences() { return [keepUrl]; },
    async isSceneAssetReferenced(url) { return url === keepUrl; }
  };
  const config = { siteAssetsRoot:root };

  try {
    const removed = await cleanupUnreferencedSceneAssets({
      store,
      config,
      olderThanMs:24 * 60 * 60 * 1000,
      now:Date.now() + 25 * 60 * 60 * 1000
    });
    assert.equal(removed, 1);
    await access(path.join(directory, keep));
    await assert.rejects(access(path.join(directory, orphan)));

    assert.equal(await deleteSceneAsset(keepUrl, { store, config }), false);
    await access(path.join(directory, keep));
    assert.equal(await deleteSceneAsset(keepUrl, { store, config, force:true }), true);
    await assert.rejects(access(path.join(directory, keep)));
    assert.equal(await deleteSceneAsset(orphanUrl, { store, config, force:true }), true);
  } finally {
    await rm(root, { recursive:true, force:true });
  }
});
