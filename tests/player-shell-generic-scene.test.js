import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root=new URL('../src/web/admin-ui/public/',import.meta.url);
const read=(p)=>readFile(new URL(p,root),'utf8');

test('offline Player shell contains only active generic scene runtime dependencies', async()=>{
  const [worker,html]=await Promise.all([read('player-sw.js'),read('player.html')]);
  assert.match(worker,/const SHELL_CACHE = 'mira-tv-player-shell-v48'/);
  assert.match(worker,/\/css\/player-scene\.css/);
  assert.match(html,/\/css\/player-scene\.css/);
  for(const retired of [
    '/css/motion-overlays.css','/css/brand-motion-v2.css',
    '/js/motion/entity-editor.js','/js/motion/entity-behavior.js',
    '/js/motion/announcement.js','/js/motion/brand-title.js','/js/motion/environment.js'
  ]) {
    assert.equal(worker.includes(retired),false,retired);
    assert.equal(html.includes(retired),false,retired);
  }
  assert.match(worker,/\^\\\/site-assets\\\/\.\*\\\.\(\?:mp4\|webm\)/);
  assert.doesNotMatch(worker,/site-assets\\\/entities\\\//);
});
