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
  for (const photoshopControl of ['Трекинг, px','Интерлиньяж, %','Масштаб X, %','Масштаб Y, %','Смещение базы, px','Обводка','Тень','Свечение','Автомасштаб при resize','Масштаб внутри, %']) assert.ok(elements.includes(photoshopControl));
  assert.match(sceneHtml, /scene-editor-background-layer[\s\S]*?<svg viewBox="0 0 24 24"/);
  assert.match(sceneHtml, /scene-editor-table-layer[\s\S]*?<svg viewBox="0 0 24 24"/);
  assert.match(css, /scene-editor-system-layer\{[^}]*min-height:25px/);
  assert.match(css, /scene-editor-system-icon svg/);
  assert.match(css, /scene-editor-layers-panel\{grid-template-rows:auto auto minmax\(0,1fr\) auto\}/);
  assert.match(css, /scene-editor-system-layers\{[^}]*align-content:start/);
  assert.match(elements, /export function renderSceneLayerList/);
  assert.match(elements, /title\.textContent = typeLabel\(element\.type\)/);
  assert.doesNotMatch(elements, /title\.textContent = `Элемент \$\{index \+ 1\}/);
  assert.match(css, /scene-editor-layer\{[^}]*min-height:25px/);
  assert.match(css, /scene-editor-selection-box\{[^}]*background:transparent/);
  assert.match(elements, /export function renderSceneElementInspector/);
  assert.match(elements, /SCENE_ELEMENT_TYPE_OPTIONS\.filter\(\(\[value\]\) => value !== 'weather'\)/);
  assert.match(scenePage, /new PlayerSceneRenderer\(stage, \{ autoplay: false, weatherPreview: true \}\)/);
  assert.match(scenePage, /--scene-preview-width/);
  assert.match(scenePage, /--scene-preview-height/);
  assert.match(scenePage, /--scene-preview-scale/);
  assert.match(css, /width:var\(--scene-preview-width,1920px\)!important/);
  assert.match(css, /transform:scale\(var\(--scene-preview-scale,1\)\)!important/);
  assert.match(scenePage, /renderSceneElementInspector/);
  assert.match(scenePage, /renderSceneLayerList/);
  assert.match(scenePage, /\/scene-asset/);
  assert.match(scenePage, /SCENE_WIDTH \/ Math\.max\(1, rect\.width\)/);
  assert.match(css, /grid-template-columns:164px minmax\(0,1fr\) 304px/);
  assert.match(css, /grid-template-columns:150px minmax\(0,1fr\) 286px/);
  assert.match(css, /@media\(min-width:1101px\)/);
  assert.doesNotMatch(css, /scene-editor-inspector-tabs|@media\(min-width:961px\)/);
  assert.match(css, /overflow:hidden/);

  assert.match(service, /SCENE_DIR = 'scene'/);
  assert.match(service, /deleteSceneAsset/);
  assert.match(service, /cleanupUnreferencedSceneAssets/);
  assert.match(service, /videoCodecMatches/);
  assert.match(routes, /createSceneAssetStream/);
  assert.match(routes, /droppedSceneAssets/);
  assert.match(routes, /deleteSceneAsset/);
});
