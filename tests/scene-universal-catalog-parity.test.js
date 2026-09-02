import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Scene Preview and Published Player consume one universal catalog contract', async () => {
  const [editor, renderer, playerRuntime, html] = await Promise.all([
    source('src/web/admin-ui/public/js/scenes/editor.js'),
    source('src/web/admin-ui/public/js/scene-runtime/renderer.js'),
    source('src/web/admin-ui/public/js/player/published-scene-runtime.js'),
    source('src/web/admin-ui/public/scene-editor.html')
  ]);

  assert.match(editor, /api\.get\(API\.catalogItems\)/);
  assert.match(editor, /api\.get\(API\.catalogClasses\)/);
  assert.doesNotMatch(editor, /api\.get\(API\.products\)/);
  assert.match(editor, /catalogItems:\s*state\.catalogItems/);

  assert.match(renderer, /const catalogItems = context\.catalogItems \|\| context\.catalogProducts \|\| \[\]/);
  assert.match(renderer, /catalogTableColumns\(config, catalogItems\)/);
  assert.match(renderer, /buildCatalogTableRows\(catalogItems, config\)/);
  assert.match(playerRuntime, /catalogItems:\s*catalogItems\(component\)/);

  assert.match(html, /id="table-class-code"/);
  assert.match(html, /id="table-price-layout"/);
  assert.match(html, /id="table-show-metadata"/);
  assert.doesNotMatch(html, /id="table-show-producer"/);
});

test('Player refreshes changed shell code without discarding cached media', async () => {
  const serviceWorker = await source('src/web/admin-ui/public/player-sw.js');
  assert.match(serviceWorker, /mira-tv-player-shell-v16-scene10/);
  assert.match(serviceWorker, /mira-tv-player-data-v16-scene8/);
  assert.match(serviceWorker, /'\/js\/scene-runtime\/renderer\.js'/);
  assert.match(serviceWorker, /'\/js\/scenes\/catalog-table\.js'/);
  assert.match(serviceWorker, /'\/js\/player\/published-scene-runtime\.js'/);
});
