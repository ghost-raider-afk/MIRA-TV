import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Scene Editor exposes an explicit saved-state apply action without a parallel renderer', async () => {
  const [application, module] = await Promise.all([
    readFile(new URL('../src/web/admin-ui/public/js/application.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/web/admin-ui/public/js/pages/scene-tv-apply.js', import.meta.url), 'utf8')
  ]);
  assert.match(application, /import\('\.\/pages\/scene-tv-apply\.js'\)/);
  assert.match(module, /button\.textContent = 'Применить на ТВ';/);
  assert.match(module, /dirtyState\.classList\.contains\('is-dirty'\)/);
  assert.match(module, /api\.post\(`\$\{API\.deviceBindings\}\/\$\{screenId\}\/apply`, \{\}\)/);
  assert.doesNotMatch(module, /PlayerSceneRenderer|FlatMenuRenderer|SceneElementRenderer/);
});

test('force apply bumps persistent render revision and wakes the existing realtime Player', async () => {
  const source = await readFile(new URL('../src/api/device/admin-routes.js', import.meta.url), 'utf8');
  assert.match(source, /router\.post\('\/bindings\/:screenId\/apply'/);
  assert.match(source, /markScreenRenderChanged\([\s\S]*\['screen', 'menu', 'scene', 'runtime'\][\s\S]*'screen\.force_applied'/);
  assert.match(source, /realtime\?\.notifyScreen\(screenId, revision\.revision, \{ forceRender:true \}\)/);
  assert.doesNotMatch(source, /requestScreenPreview|capturePreview/);
});
