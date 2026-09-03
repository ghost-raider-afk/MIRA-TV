import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Scene editor uses one compact contextual toolbar instead of a second Office workspace', async () => {
  const [application, ribbon, css, indexCss] = await Promise.all([
    read('src/web/admin-ui/public/js/application.js'),
    read('src/web/admin-ui/public/js/scenes/ribbon.js'),
    read('src/web/admin-ui/public/css/pages/scene-ribbon.css'),
    read('src/web/admin-ui/public/css/index.css')
  ]);

  assert.match(application, /import\('\.\/scenes\/ribbon\.js'\)/);
  assert.match(application, /initialiseSceneRibbon\(\)/);
  assert.match(indexCss, /scene-ribbon\.css/);
  assert.doesNotMatch(ribbon, /createTabs|data-ribbon-tab|Главная.*Вставка.*Оформление/s);
  for (const action of ['Шаблоны', '+ Меню', 'Текст', 'Фото', 'Ещё…', 'Свойства', 'Оформление', 'Данные', 'Анимация']) {
    assert.ok(ribbon.includes(action), `missing contextual toolbar action: ${action}`);
  }
  assert.match(css, /height:\s*52px/);
  assert.match(css, /overflow:\s*hidden/);
  assert.match(css, /grid-template-rows:\s*48px 52px minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /height:\s*88px/);
});

test('context toolbar is a synchronized shortcut layer over existing Inspector controls', async () => {
  const ribbon = await read('src/web/admin-ui/public/js/scenes/ribbon.js');
  for (const binding of [
    '#element-width',
    '#element-height',
    '#element-background-mode',
    '#element-background-color',
    '#element-font-size',
    '#element-font-weight',
    '#element-color',
    '#element-text-align',
    '#table-preset',
    '#table-density',
    '#element-variant',
    '#element-media-fit',
    '#element-media-position'
  ]) {
    assert.ok(ribbon.includes(binding), `missing quick binding: ${binding}`);
  }
  assert.match(ribbon, /source\.dispatchEvent\(new Event\(eventName, \{ bubbles: true \}\)\)/);
  assert.match(ribbon, /data-ribbon-inspector/);
  assert.doesNotMatch(ribbon, /localStorage|sessionStorage|fetch\(/);
});

test('right Inspector stays complete, readable and compact without microscopic controls', async () => {
  const [ribbonCss, officeCss, indexCss] = await Promise.all([
    read('src/web/admin-ui/public/css/pages/scene-ribbon.css'),
    read('src/web/admin-ui/public/css/pages/scene-office.css'),
    read('src/web/admin-ui/public/css/index.css')
  ]);

  assert.match(indexCss, /scene-designer\.css[\s\S]*scene-office\.css/);
  assert.match(ribbonCss, /data-inspector-tab="format"[\s\S]*display:\s*revert/);
  assert.match(ribbonCss, /data-inspector-panel="format"[\s\S]*display:\s*revert/);
  assert.match(officeCss, /grid-template-columns:\s*158px minmax\(0, 1fr\) 316px/);
  assert.match(officeCss, /\.scene-inspector[\s\S]*padding:\s*9px 10px 12px/);
  assert.match(officeCss, /\.scene-inspector-tabs[\s\S]*grid-template-columns:\s*repeat\(4/);
  assert.match(officeCss, /min-height:\s*32px/);
  assert.match(officeCss, /font-size:\s*10\.5px/);
  assert.doesNotMatch(officeCss, /font-size:\s*7px/);
  assert.match(officeCss, /\.scene-inspector details[\s\S]*border-top:/);
});
