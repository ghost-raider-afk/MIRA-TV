import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=(p)=>readFile(new URL(p,root),'utf8');

test('Playlist Studio no longer owns scene elements or aquarium', async()=>{
  const [html,js,app]=await Promise.all([
    read('src/web/admin-ui/public/playlist.html'),
    read('src/web/admin-ui/public/js/pages/playlist.js'),
    read('src/web/admin-ui/public/js/application.js')
  ]);
  for(const legacy of ['aquarium','animation-brand','animation-entity','animation-announcement']) {
    assert.equal(html.toLowerCase().includes(legacy),false,legacy);
    assert.equal(js.toLowerCase().includes(legacy),false,legacy);
  }
  assert.match(js,/new PlayerSceneRenderer/);
  assert.match(js,/new ScenePlaylistEditor/);
  assert.doesNotMatch(app,/initialiseWeatherStudio|initialiseAnimationObjectManager/);
});
