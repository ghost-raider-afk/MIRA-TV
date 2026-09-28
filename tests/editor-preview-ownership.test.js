import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Scene remains the only canonical editor while TV management reuses network snapshots', async () => {
  const [monitorHtml, monitorEditor, screensPage, sceneHtml, sceneEditor, rows, editorCss, sceneCss] = await Promise.all([
    read('src/web/admin-ui/public/screen-editor.html'),
    read('src/web/admin-ui/public/js/editor/editor.js'),
    read('src/web/admin-ui/public/js/pages/screens.js'),
    read('src/web/admin-ui/public/scene.html'),
    read('src/web/admin-ui/public/js/pages/scene.js'),
    read('src/web/admin-ui/public/js/editor/rows.js'),
    read('src/web/admin-ui/public/css/editor/editor.css'),
    read('src/web/admin-ui/public/css/pages/scene-editor.css')
  ]);

  assert.match(monitorHtml, /Управление ТВ/);
  assert.doesNotMatch(monitorHtml, /editor-menu-preview|editor-preview-scene-link|editor-preview-row-inspector|editor-add-section|editor-add-item|editor-add-packaging/);
  assert.doesNotMatch(monitorHtml, /editor-background-file|editor-table-x|editor-font-family/);
  assert.match(monitorEditor, /\/screens\?manage=/);
  assert.doesNotMatch(monitorEditor, /PlayerSceneRenderer|renderPreviewRows|appendRow|renderPreview\(/);
  assert.match(screensPage, /screen-tv-management-dialog/);
  assert.match(screensPage, /deviceBindings/);
  assert.match(screensPage, /\/preview\?v=/);
  assert.doesNotMatch(screensPage, /PlayerSceneRenderer|renderPreviewRows|appendRow|buildRenderModel/);

  assert.match(sceneHtml, /id="scene-editor-table-edit-layer"/);
  assert.match(sceneHtml, /id="scene-editor-background-layer"/);
  assert.match(sceneHtml, /id="scene-editor-table-layer"/);
  assert.match(sceneEditor, /renderTableEditorRows/);
  assert.doesNotMatch(sceneEditor, /renderPreviewRows/);
  assert.doesNotMatch(sceneEditor, /buildRenderModel/);
  assert.doesNotMatch(sceneEditor, /appendRow/);
  assert.doesNotMatch(sceneEditor, /data-scene-table-row-inspector/);
  assert.match(sceneEditor, /tableEditorOpen/);
  assert.match(sceneEditor, /closeTableEditor/);

  assert.match(rows, /line\.sourceRowId/);
  assert.match(rows, /line\.sourceRowIds/);
  assert.match(rows, /sortSectionItems/);
  assert.match(rows, /datasetName:'previewProductSelect'/);
  assert.match(rows, /role', 'combobox'/);
  assert.match(rows, /editor-preview-choice-search/);
  assert.doesNotMatch(rows, /createElement\('select'\)/);
  assert.match(rows, /updateRow\(editorState, row\.id, \{ name: input\.value \}\)/);
  assert.doesNotMatch(rows, /createElement\('table'\)|<thead>|<tbody>/);
  assert.doesNotMatch(editorCss, /editor-menu-editor-table|editor-menu-table-scroll|editor-menu-rows/);
  assert.match(sceneCss, /scene-editor-table-edit-layer/);
  assert.match(sceneCss, /scene-table-editor-dialog/);
  assert.match(sceneCss, /position:fixed!important/);
  assert.match(rows, /onClose/);
  assert.match(rows, /appendRow\(editorState, kind\)/);
  assert.match(sceneCss, /scene-table-editor-row/);
  assert.match(sceneCss, /editor-preview-inline-control/);
});
