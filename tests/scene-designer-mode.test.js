import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Scene Editor is a full-screen three-pane Designer workspace', async () => {
  const [application, designer, css, index] = await Promise.all([
    read('src/web/admin-ui/public/js/application.js'),
    read('src/web/admin-ui/public/js/scenes/designer.js'),
    read('src/web/admin-ui/public/css/pages/scene-designer.css'),
    read('src/web/admin-ui/public/css/index.css')
  ]);

  assert.match(application, /initialiseSceneDesigner\(\);[\s\S]*await initialiseSceneEditor\(\)/);
  assert.match(index, /scene-designer\.css/);
  assert.match(css, /\.ui-rail,[\s\S]*\.ui-context,[\s\S]*\.app-header[\s\S]*display: none !important/);
  assert.match(css, /\.scene-editor-page[\s\S]*height: 100dvh/);
  assert.match(css, /grid-template-columns: 184px minmax\(0, 1fr\) 320px/);
  assert.match(css, /\.scene-slides-panel[\s\S]*grid-column: 1/);
  assert.match(css, /\.scene-stage-column[\s\S]*grid-column: 2/);
  assert.match(css, /\.scene-inspector[\s\S]*grid-column: 3[\s\S]*position: static/);
  assert.match(css, /\.scene-tools-panel[\s\S]*position: absolute/);
  assert.match(designer, /mountSlidesPanel\(\)/);
  assert.match(designer, /scene-tools-collapsed/);
  assert.doesNotMatch(designer, /classList\.add\([^\n]*scene-inspector-collapsed/);
  assert.match(designer, /classList\.remove\('scene-inspector-collapsed'\)/);
  assert.match(designer, /Math\.min\(available\.width, available\.height \* aspect\)/);
  assert.match(designer, /rescaleRenderedElements\(stage, width \/ canvasWidth\)/);
  assert.doesNotMatch(designer, /stage\.style\.transform = `scale/);
});

test('Monitors are assignment endpoints and no longer open the legacy content editor', async () => {
  const [application, screens, html] = await Promise.all([
    read('src/web/admin-ui/public/js/application.js'),
    read('src/web/admin-ui/public/js/pages/screens.js'),
    read('src/web/admin-ui/public/screens.html')
  ]);

  assert.match(application, /case 'screen-editor':[\s\S]*navigate\('\/screens\.html', \{ replace: true \}\)/);
  assert.doesNotMatch(application, /import\('\.\/editor\/editor\.js'\)/);
  assert.doesNotMatch(screens, /\/screen-editor\?id=/);
  assert.doesNotMatch(screens, /source_screen_id/);
  assert.doesNotMatch(screens, /createSourceSelect/);
  assert.match(screens, /Назначьте ему опубликованную сцену/);
  assert.match(html, /Контент создаётся только в «Сценах»/);
});
