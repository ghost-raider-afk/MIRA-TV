import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Scene Editor keeps the Canvas scale stable while Inspector content changes', async () => {
  const css = await read('src/web/admin-ui/public/css/pages/scene-editor-workspace.css');
  assert.match(css, /body\[data-page="scene-editor"\][\s\S]*overflow: hidden/);
  assert.match(css, /\.app-content[\s\S]*height: 100dvh/);
  assert.match(css, /\.scene-inspector[\s\S]*scrollbar-gutter: stable/);
  assert.match(css, /\.scene-stage-shell[\s\S]*scrollbar-gutter: stable both-edges/);
});

test('transparent object background is an explicit control backed by the existing Scene background value', async () => {
  const [html, controls] = await Promise.all([
    read('src/web/admin-ui/public/scene-editor.html'),
    read('src/web/admin-ui/public/js/scenes/format-controls.js')
  ]);
  assert.match(html, /id="element-background-mode"/);
  assert.match(html, />Прозрачный<\/option>/);
  assert.match(html, />Фон объекта<\/span>/);
  assert.match(controls, /source\.value = mode\.value === 'transparent' \? 'transparent'/);
  assert.match(controls, /dispatch\(source, 'change'\)/);
});

test('widget preset names are neutral and do not mention iPhone', async () => {
  const html = await read('src/web/admin-ui/public/scene-editor.html');
  assert.doesNotMatch(html, /iPhone/i);
  assert.match(html, />Тёмный<\/option>/);
  assert.match(html, />Светлый<\/option>/);
  assert.match(html, />Синий<\/option>/);
  assert.match(html, />Без подложки<\/option>/);
});

test('MIRA table presentation is shared by Preview and TV Player', async () => {
  const [indexCss, player, tableCss, worker] = await Promise.all([
    read('src/web/admin-ui/public/css/index.css'),
    read('src/web/admin-ui/public/player.html'),
    read('src/web/admin-ui/public/css/scene-table-main.css'),
    read('src/web/admin-ui/public/player-sw.js')
  ]);
  assert.match(indexCss, /scene-table-main\.css/);
  assert.match(player, /\/css\/scene-table-main\.css/);
  assert.match(worker, /'\/css\/scene-table-main\.css'/);
  assert.match(tableCss, /data-preset="clean"/);
  assert.match(tableCss, /white-space: pre-line/);
  assert.match(tableCss, /border-bottom: 1px dashed/);
});
