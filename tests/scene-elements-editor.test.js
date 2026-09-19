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
  assert.match(html, /id="editor-elements-stack"/);
  assert.doesNotMatch(html, /editor-elements-list|editor-element-properties/);
  for (const label of ['Текстовое поле','Погода','Картинка','Видео','Логотип']) assert.ok(elements.includes(label));
  assert.match(elements, /className = 'editor-element-card'/);
  assert.match(elements, /`Элемент \${index \+ 1}`/);
  assert.match(elements, /aria-label', `Тип элемента \${index \+ 1}`/);
  assert.match(elements, /const current = elementById\(state, element\.id\) \|\| element/);
  assert.match(elements, /replaceSceneElement\(state, current\.id, replacement\)/);
  for (const photoshopControl of ['Трекинг, px','Интерлиньяж, %','Масштаб X, %','Масштаб Y, %','Смещение базы, px','Обводка','Тень','Свечение']) assert.ok(elements.includes(photoshopControl));
  assert.match(editor, /container: elementsContainer/);
  assert.doesNotMatch(editor, /elementsList|elementProperties/);
  assert.match(editor, /renderSceneElements/);
  assert.match(editor, /\/scene-asset/);
  assert.match(service, /SCENE_DIR = 'scene'/);
  assert.doesNotMatch(service, /updateAnimationEntity|sceneEntityInput/);
  assert.match(routes, /createSceneAssetStream/);
});
