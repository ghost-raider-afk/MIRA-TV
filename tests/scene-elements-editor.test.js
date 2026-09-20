import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('dedicated Scene editor is the only admin owner of generic scene elements', async () => {
  const [sceneHtml, monitorHtml, scenePage, elements, service, routes, css] = await Promise.all([
    read('src/web/admin-ui/public/scene.html'),
    read('src/web/admin-ui/public/screen-editor.html'),
    read('src/web/admin-ui/public/js/pages/scene.js'),
    read('src/web/admin-ui/public/js/editor/elements.js'),
    read('src/services/scene-assets-service.js'),
    read('src/api/screens/routes.js'),
    read('src/web/admin-ui/public/css/pages/scene-editor.css')
  ]);

  assert.match(sceneHtml, /id="scene-editor-layers"/);
  assert.match(sceneHtml, /id="scene-editor-stage"/);
  assert.match(sceneHtml, /id="scene-editor-properties"/);
  assert.match(sceneHtml, /id="scene-editor-add"/);
  assert.match(sceneHtml, /id="scene-editor-save"/);
  assert.doesNotMatch(monitorHtml, /<summary>Элементы<\/summary>|editor-add-element|editor-elements-stack/);
  assert.match(monitorHtml, /id="editor-scene-link"/);

  for (const label of ['Текстовое поле','Погода','Картинка','Видео','Логотип']) assert.ok(elements.includes(label));
  for (const photoshopControl of ['Трекинг, px','Интерлиньяж, %','Масштаб X, %','Масштаб Y, %','Смещение базы, px','Обводка','Тень','Свечение']) assert.ok(elements.includes(photoshopControl));
  assert.match(elements, /export function renderSceneLayerList/);
  assert.match(elements, /export function renderSceneElementInspector/);
  assert.match(elements, /SCENE_ELEMENT_TYPE_OPTIONS\.filter\(\(\[value\]\) => value !== 'weather'\)/);
  assert.match(scenePage, /new PlayerSceneRenderer\(stage, \{ autoplay: false, weatherPreview: true \}\)/);
  assert.match(scenePage, /renderSceneElementInspector/);
  assert.match(scenePage, /renderSceneLayerList/);
  assert.match(scenePage, /\/scene-asset/);
  assert.match(scenePage, /SCENE_WIDTH \/ Math\.max\(1, rect\.width\)/);
  assert.match(css, /grid-template-columns:220px minmax\(0,1fr\) 336px/);
  assert.match(css, /overflow:hidden/);

  assert.match(service, /SCENE_DIR = 'scene'/);
  assert.match(service, /deleteSceneAsset/);
  assert.match(service, /cleanupUnreferencedSceneAssets/);
  assert.match(service, /videoCodecMatches/);
  assert.match(routes, /createSceneAssetStream/);
  assert.match(routes, /droppedSceneAssets/);
  assert.match(routes, /deleteSceneAsset/);
});
