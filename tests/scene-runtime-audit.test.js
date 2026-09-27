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

test('scene owns one weather element and rejects video in new drafts', () => {
  const weather = (id) => ({ ...baseElement(id,'weather'), weather:{ latitude:60, longitude:25 } });
  assert.throws(() => sceneInput({version:1,elements:[weather('w1'),weather('w2')]}), /только один элемент «Погода»/);
  assert.throws(() => sceneInput({version:1,elements:[{...baseElement('v1','video'),media:{source_url:''}}]}), /неподдерживаемое значение/);
});

test('scene asset cleanup preserves referenced images and removes old image orphans', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(),'mira-scene-assets-'));
  const directory = path.join(root,'scene');
  await mkdir(directory,{recursive:true});
  const keep='scene-11111111-1111-4111-8111-111111111111.png';
  const orphan='scene-22222222-2222-4222-8222-222222222222.webp';
  await writeFile(path.join(directory,keep),'keep');
  await writeFile(path.join(directory,orphan),'orphan');
  const keepUrl='/site-assets/scene/'+keep;
  const store={async listSceneAssetReferences(){return [keepUrl];},async isSceneAssetReferenced(url){return url===keepUrl;}};
  const config={siteAssetsRoot:root};
  try {
    const removed=await cleanupUnreferencedSceneAssets({store,config,olderThanMs:1,now:Date.now()+10000});
    assert.equal(removed,1);
    await access(path.join(directory,keep));
    await assert.rejects(access(path.join(directory,orphan)));
    assert.equal(await deleteSceneAsset(keepUrl,{store,config}),false);
  } finally {
    await rm(root,{recursive:true,force:true});
  }
});
