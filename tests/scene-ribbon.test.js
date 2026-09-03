import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Scene editor uses a compact Office-like contextual ribbon', async () => {
  const [application, ribbon, css, indexCss] = await Promise.all([
    read('src/web/admin-ui/public/js/application.js'),
    read('src/web/admin-ui/public/js/scenes/ribbon.js'),
    read('src/web/admin-ui/public/css/pages/scene-ribbon.css'),
    read('src/web/admin-ui/public/css/index.css')
  ]);

  assert.match(application, /import\('\.\/scenes\/ribbon\.js'\)/);
  assert.match(application, /initialiseSceneRibbon\(\)/);
  assert.match(indexCss, /scene-ribbon\.css/);
  for (const tab of ['Главная', 'Вставка', 'Оформление', 'Данные', 'Анимация']) {
    assert.ok(ribbon.includes(`'${tab}'`), `missing Office ribbon tab: ${tab}`);
  }
  for (const group of ['Положение и размер', 'Упорядочить', 'Дизайн', 'Элементы', 'Шрифт и текст', 'Заливка и контур', 'Эффекты', 'Меню', 'Состав меню']) {
    assert.ok(ribbon.includes(`group('${group}'`), `missing ribbon group: ${group}`);
  }
  for (const action of ['Меню', 'Текст', 'Фото', 'Логотип', 'Видео', 'Погода', 'Часы', 'Фигура', 'Фон слайда']) {
    assert.ok(ribbon.includes(action), `missing insertion action: ${action}`);
  }
  assert.match(css, /grid-template-rows:\s*24px 64px/);
  assert.match(css, /height:\s*88px/);
  assert.match(css, /\.scene-ribbon-panels[\s\S]*overflow:\s*hidden/);
  assert.match(css, /\.scene-ribbon-group[\s\S]*border-right:/);
});

test('ribbon is a synchronized shortcut layer over the existing Scene controls', async () => {
  const ribbon = await read('src/web/admin-ui/public/js/scenes/ribbon.js');
  for (const binding of [
    '#element-x',
    '#element-y',
    '#element-width',
    '#element-height',
    '#element-background-mode',
    '#element-font-size',
    '#element-line-height',
    '#element-letter-spacing',
    '#element-opacity',
    '#element-blur',
    '#table-preset',
    '#table-density',
    '#table-class-code',
    '#table-row-limit',
    '#element-variant',
    '#element-media-fit',
    '#element-entrance',
    '#element-loop',
    '#element-exit'
  ]) {
    assert.ok(ribbon.includes(binding), `missing ribbon binding: ${binding}`);
  }
  assert.match(ribbon, /source\.dispatchEvent\(new Event\(eventName, \{ bubbles: true \}\)\)/);
  assert.match(ribbon, /data-menu-compose/);
  assert.doesNotMatch(ribbon, /localStorage|sessionStorage|fetch\(/);
});

test('right Inspector remains complete and is compact instead of being removed', async () => {
  const [ribbonCss, officeCss, indexCss] = await Promise.all([
    read('src/web/admin-ui/public/css/pages/scene-ribbon.css'),
    read('src/web/admin-ui/public/css/pages/scene-office.css'),
    read('src/web/admin-ui/public/css/index.css')
  ]);

  assert.match(indexCss, /scene-designer\.css[\s\S]*scene-office\.css/);
  assert.match(ribbonCss, /data-inspector-tab="format"[\s\S]*display:\s*revert/);
  assert.match(ribbonCss, /data-inspector-panel="format"[\s\S]*display:\s*revert/);
  assert.doesNotMatch(ribbonCss, /data-inspector-panel="format"[^}]*display:\s*none\s*!important/);
  assert.match(officeCss, /grid-template-columns:\s*176px minmax\(0, 1fr\) 304px/);
  assert.match(officeCss, /\.scene-inspector[\s\S]*padding:\s*8px 8px 10px/);
  assert.match(officeCss, /\.scene-inspector-tabs[\s\S]*grid-template-columns:\s*repeat\(4/);
  assert.match(officeCss, /\.scene-inspector details[\s\S]*border-top:/);
});
