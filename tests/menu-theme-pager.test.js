import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  ALCOHOL_WARNING_MIN_AREA_RATIO,
  ALCOHOL_WARNING_REFERENCE_AREA_RATIO,
  ALCOHOL_WARNING_TEXT
} from '../src/web/admin-ui/public/js/themes/menu-theme-registry.js';

const read = (path) => readFile(new URL('../src/web/admin-ui/public/' + path, import.meta.url),'utf8');

test('theme renderer has no screen pager and keeps one shared runtime', async () => {
  const [renderer,player] = await Promise.all([
    read('js/player/menu-theme-renderer.js'),
    read('js/player/player-scene-renderer.js')
  ]);
  assert.doesNotMatch(renderer,/location_screen_count/);
  assert.doesNotMatch(renderer,/Экран \+/);
  assert.doesNotMatch(renderer,/menu-theme-pager/);
  assert.equal((player.match(/new MenuThemeRenderer/g)||[]).length,1);
});

test('alcohol themes reserve at least ten percent of the 1920x1080 frame for the warning', async () => {
  assert.equal(ALCOHOL_WARNING_TEXT,'ЧРЕЗМЕРНОЕ УПОТРЕБЛЕНИЕ АЛКОГОЛЯ ВРЕДИТ ВАШЕМУ ЗДОРОВЬЮ');
  assert.ok(ALCOHOL_WARNING_REFERENCE_AREA_RATIO.ratio >= ALCOHOL_WARNING_MIN_AREA_RATIO);
  const renderer=await read('js/player/menu-theme-renderer.js');
  assert.match(renderer,/data\.legalWarning='alcohol'/);
  assert.match(renderer,/ALCOHOL_WARNING_TEXT/);
});
