import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Table element renders native table structure instead of a card with grid rows', async () => {
  const [renderer, css, html] = await Promise.all([
    read('src/web/admin-ui/public/js/scene-runtime/renderer.js'),
    read('src/web/admin-ui/public/css/scene-renderer.css'),
    read('src/web/admin-ui/public/scene-editor.html')
  ]);
  assert.match(renderer, /document\.createElement\('table'\)/);
  assert.match(renderer, /document\.createElement\('thead'\)/);
  assert.match(renderer, /document\.createElement\('tbody'\)/);
  assert.match(renderer, /document\.createElement\('th'\)/);
  assert.match(renderer, /document\.createElement\('td'\)/);
  assert.doesNotMatch(renderer, /function gridTemplate\(/);
  assert.match(css, /data-preset="clean"/);
  assert.match(css, /data-preset="solid"/);
  assert.match(html, /<option value="clean">MIRA-TV<\/option>/);
  assert.match(html, /<option value="solid">Сетка · Excel<\/option>/);
  assert.match(html, /Строка заголовков/);
  assert.match(html, /Высота строк/);
});

test('Clock and weather are first-class iPhone-like widget layouts with transparent surface option', async () => {
  const [renderer, css, html, controls] = await Promise.all([
    read('src/web/admin-ui/public/js/scene-runtime/renderer.js'),
    read('src/web/admin-ui/public/css/scene-renderer.css'),
    read('src/web/admin-ui/public/scene-editor.html'),
    read('src/web/admin-ui/public/js/scenes/format-controls.js')
  ]);
  assert.match(renderer, /scene-clock-kicker/);
  assert.match(renderer, /scene-weather-location/);
  assert.match(renderer, /scene-weather-range/);
  assert.match(renderer, /scene-weather-forecast/);
  assert.match(css, /scene-element-clock\[data-transparent-background="false"\]::before/);
  assert.match(css, /scene-element-weather\[data-transparent-background="false"\]::before/);
  assert.match(html, /id="element-background-mode"/);
  assert.match(html, /<option value="transparent">Прозрачный<\/option>/);
  assert.match(html, /iPhone · тёмный/);
  assert.match(html, /iPhone · светлый/);
  assert.match(controls, /background: 'transparent'/);
});

test('Inspector scrolling cannot resize desktop Canvas workspace', async () => {
  const [workspace, application] = await Promise.all([
    read('src/web/admin-ui/public/css/pages/scene-editor-workspace.css'),
    read('src/web/admin-ui/public/js/application.js')
  ]);
  assert.match(workspace, /height: calc\(100dvh - 24px\)/);
  assert.match(workspace, /\.scene-inspector[\s\S]*overscroll-behavior: contain/);
  assert.match(application, /import\('\.\/scenes\/format-controls\.js'\)/);
  assert.match(application, /initialiseSceneFormatControls\(\)/);
});
