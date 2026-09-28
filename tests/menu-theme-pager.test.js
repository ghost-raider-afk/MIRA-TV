import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../src/web/admin-ui/public/' + path, import.meta.url),'utf8');

test('theme renderer omits screen N of M pager and keeps a single shared runtime', async () => {
  const [renderer,player] = await Promise.all([
    read('js/player/menu-theme-renderer.js'),
    read('js/player/player-scene-renderer.js')
  ]);
  assert.doesNotMatch(renderer,/location_screen_count/);
  assert.doesNotMatch(renderer,/menu-theme-pager/);
  assert.doesNotMatch(renderer,/Экран\s*\d/);
  assert.equal((player.match(/new MenuThemeRenderer/g)||[]).length,1);
});
