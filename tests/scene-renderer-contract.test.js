import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('Scene Editor delegates content and geometry to the shared renderer', async () => {
  const editor = await source('src/web/admin-ui/public/js/scenes/editor.js');
  assert.match(editor, /from '\.\.\/scene-runtime\/renderer\.js'/);
  assert.match(editor, /renderSceneLayer\(/);
  assert.match(editor, /applySceneElementGeometry\(/);
  assert.match(editor, /applySceneStage\(/);
  assert.doesNotMatch(editor, /function renderElementContent\(/);
  assert.doesNotMatch(editor, /function renderCatalogTable\(/);
  assert.doesNotMatch(editor, /function applyElementStyle\(/);
});

test('shared renderer owns scene element content types', async () => {
  const renderer = await source('src/web/admin-ui/public/js/scene-runtime/renderer.js');
  for (const type of ['clock', 'weather', 'table', 'video', 'image', 'logo', 'shape']) {
    assert.match(renderer, new RegExp(`element\\.type === '${type}'`));
  }
  assert.match(renderer, /createSceneElementNode/);
  assert.match(renderer, /renderSceneLayer/);
});

test('renderer styles are shared by admin preview and TV Player', async () => {
  const indexCss = await source('src/web/admin-ui/public/css/index.css');
  const player = await source('src/web/admin-ui/public/player.html');
  assert.match(indexCss, /scene-renderer\.css/);
  assert.match(player, /\/css\/scene-renderer\.css/);
});

test('editor-only scene stylesheet does not own renderer animation keyframes', async () => {
  const editorCss = await source('src/web/admin-ui/public/css/pages/scenes.css');
  const rendererCss = await source('src/web/admin-ui/public/css/scene-renderer.css');
  assert.doesNotMatch(editorCss, /@keyframes scene-render-/);
  assert.match(rendererCss, /@keyframes scene-render-pulse/);
  assert.match(rendererCss, /@keyframes scene-render-float/);
});
