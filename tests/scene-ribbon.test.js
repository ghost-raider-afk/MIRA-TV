import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Scene formatting is exposed through one stable Office-style top ribbon', async () => {
  const [application, ribbon, css, indexCss] = await Promise.all([
    read('src/web/admin-ui/public/js/application.js'),
    read('src/web/admin-ui/public/js/scenes/ribbon.js'),
    read('src/web/admin-ui/public/css/pages/scene-ribbon.css'),
    read('src/web/admin-ui/public/css/index.css')
  ]);

  assert.match(application, /import\('\.\/scenes\/ribbon\.js'\)/);
  assert.match(application, /initialiseSceneRibbon\(\)/);
  assert.match(indexCss, /scene-ribbon\.css/);
  assert.match(ribbon, /ФОРМАТ ОБЪЕКТА/);
  for (const group of ['Размер', 'Шрифт и текст', 'Заливка и контур', 'Таблица', 'Виджет', 'Изображение и видео', 'Упорядочить']) {
    assert.ok(ribbon.includes(`group('${group}'`), `missing ribbon group: ${group}`);
  }
  assert.match(css, /height:104px/);
  assert.match(css, /grid-template-rows:auto 104px minmax\(0,1fr\) auto/);
});

test('ribbon proxies existing Scene controls instead of introducing duplicate authoring state', async () => {
  const ribbon = await read('src/web/admin-ui/public/js/scenes/ribbon.js');
  for (const binding of [
    '#element-background-mode',
    '#element-font-size',
    '#element-opacity',
    '#table-preset',
    '#table-density',
    '#element-variant',
    '#element-media-fit'
  ]) {
    assert.ok(ribbon.includes(binding), `missing ribbon binding: ${binding}`);
  }
  assert.match(ribbon, /source\.dispatchEvent\(new Event\(eventName, \{ bubbles: true \}\)\)/);
  assert.doesNotMatch(ribbon, /localStorage|sessionStorage|fetch\(/);
});

test('right Inspector no longer exposes a competing formatting workspace', async () => {
  const css = await read('src/web/admin-ui/public/css/pages/scene-ribbon.css');
  assert.match(css, /data-inspector-tab="format"/);
  assert.match(css, /data-inspector-panel="format"/);
  assert.match(css, /display:none !important/);
});
