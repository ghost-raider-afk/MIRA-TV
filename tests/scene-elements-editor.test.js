import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('monitor editor owns one generic scene element model', async () => {
  const [html, editor, elements, service, routes] = await Promise.all([
    read('src/web/admin-ui/public/screen-editor.html'),
    read('src/web/admin-ui/public/js/editor/editor.js'),
    read('src/web/admin-ui/public/js/editor/elements.js'),
    read('src/services/scene-assets-service.js'),
    read('src/api/screens/routes.js')
  ]);
  assert.match(html, /<summary>Элементы<\/summary>/);
  assert.match(html, /id="editor-add-element"/);
  for (const label of ['Текстовое поле','Погода','Картинка','Видео','Логотип']) assert.ok(elements.includes(label));
  assert.match(editor, /renderSceneElements/);
  assert.match(editor, /\/scene-asset/);
  assert.match(service, /SCENE_DIR = 'scene'/);
  assert.doesNotMatch(service, /updateAnimationEntity|sceneEntityInput/);
  assert.match(routes, /createSceneAssetStream/);
});
