import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Scene Editor selection and property edits do not rebuild the entire Canvas', async () => {
  const editor = await read('src/web/admin-ui/public/js/scenes/editor.js');

  assert.match(editor, /function markSelected\(node, element\)[\s\S]*clearSelectionVisual\(\)[\s\S]*node\.classList\.add\('is-selected'\)[\s\S]*renderInspector\(\)/);
  assert.match(editor, /node\.addEventListener\('click',[\s\S]*markSelected\(node, element\)/);
  assert.match(editor, /function updateSelected\([\s\S]*patchSelectedElement\(element, refresh\)/);
  assert.match(editor, /function patchSelectedElement\([\s\S]*applySceneElementGeometry/);
  assert.match(editor, /document\.querySelector\('#scene-stage'\)\.addEventListener\('click',[\s\S]*clearSelectionVisual\(\)[\s\S]*renderInspector\(\)/);
});

test('Scene Editor exposes Windows-style context actions and clipboard shortcuts', async () => {
  const [editor, css] = await Promise.all([
    read('src/web/admin-ui/public/js/scenes/editor.js'),
    read('src/web/admin-ui/public/css/pages/scenes.css')
  ]);

  assert.match(editor, /addEventListener\('contextmenu'/);
  assert.match(editor, /'Вырезать'/);
  assert.match(editor, /'Копировать'/);
  assert.match(editor, /'Вставить'/);
  assert.match(editor, /'На передний план'/);
  assert.match(editor, /'На задний план'/);
  assert.match(editor, /key === 'c'/);
  assert.match(editor, /key === 'x'/);
  assert.match(editor, /key === 'v'/);
  assert.match(css, /\.scene-context-menu\{/);
  assert.match(css, /\.scene-context-menu-item\{/);
});
