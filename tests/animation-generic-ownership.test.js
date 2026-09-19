import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=(p)=>readFile(new URL(p,root),'utf8');
test('animation storage owns only motion profile and scene playlist', async()=>{
 const [contract,repository,screens]=await Promise.all([read('src/contracts/animation.js'),read('src/db/settings.js'),read('src/db/screens.js')]);
 for(const name of ['sceneEntityInput','announcementInput','brandTitleInput','environmentInput']) assert.doesNotMatch(contract,new RegExp(name));
 for(const name of ['entity_json','announcement_json','brand_json','environment_json','updateAnimationEntity']) {
  assert.doesNotMatch(repository,new RegExp(name));
  assert.doesNotMatch(screens,new RegExp(name));
 }
 assert.match(contract,/scenePlaylistInput/);
 assert.match(repository,/scene_playlist_json/);
 assert.match(screens,/scene_playlist_json/);
});
