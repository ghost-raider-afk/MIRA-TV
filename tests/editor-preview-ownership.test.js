import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('monitor menu editing is owned by the canonical Preview instead of a parallel table', async () => {
  const [html, editor, preview, rows, css] = await Promise.all([
    read('src/web/admin-ui/public/screen-editor.html'),
    read('src/web/admin-ui/public/js/editor/editor.js'),
    read('src/web/admin-ui/public/js/editor/preview.js'),
    read('src/web/admin-ui/public/js/editor/rows.js'),
    read('src/web/admin-ui/public/css/editor/editor.css')
  ]);

  assert.doesNotMatch(html, /id="editor-menu-rows"|editor-menu-editor-table|Строки меню/);
  assert.match(html, /id="editor-menu-preview"/);
  assert.match(html, /id="editor-preview-row-inspector"/);
  for (const id of ['editor-add-section','editor-add-item','editor-add-packaging']) assert.match(html, new RegExp(`id="${id}"`));

  assert.match(editor, /renderPreviewRows/);
  assert.doesNotMatch(editor, /renderRows|refreshRows|rowsTarget|rowsEmpty/);
  assert.match(preview, /editorPreviewControlsLayer/);
  assert.doesNotMatch(preview, /SceneElementRenderer|sceneRenderer|data-scene-elements-layer|weatherPreview/);
  assert.match(preview, /target\.append\(menuLayer, editorLayer\)/);
  assert.match(preview, /return \{ model, lines, layout, editorLayer \}/);

  assert.match(rows, /line\.sourceRowId/);
  assert.match(rows, /line\.sourceRowIds/);
  assert.match(rows, /sortSectionItems/);
  assert.match(rows, /dataset\.previewProductSelect/);
  assert.match(rows, /updateRow\(editorState, row\.id, \{ name: input\.value \}\)/);
  assert.doesNotMatch(rows, /createElement\('table'\)|<thead>|<tbody>/);
  assert.doesNotMatch(css, /editor-menu-editor-table|editor-menu-table-scroll|editor-menu-rows/);
  assert.match(css, /editor-preview-controls-layer/);
  assert.match(css, /data-editor-preview-menu-layer[^\n]*section-title[^\n]*item-name[^\n]*packaging-name[^\n]*visibility:hidden/);
});
