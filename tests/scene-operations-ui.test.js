import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Scene Editor exposes one-step publish that waits for confirmed Draft save', async () => {
  const [application, control, store] = await Promise.all([
    read('src/web/admin-ui/public/js/application.js'),
    read('src/web/admin-ui/public/js/scenes/publish-control.js'),
    read('src/web/admin-ui/public/js/scenes/store.js')
  ]);

  assert.match(application, /initialiseScenePublishControl/);
  assert.match(control, /button\.textContent = 'Опубликовать'/);
  assert.match(control, /document\.querySelector\('#scene-save'\)\?\.click\(\)/);
  assert.match(control, /state\.textContent\.trim\(\) === SAVE_OK/);
  assert.match(control, /await waitForSaved\(\)/);
  assert.match(control, /publishSceneRemote\(id\)/);
  assert.match(store, /\/publish`/);
});

test('monitor operations page assigns only published single-TV revisions and supports reversible removal', async () => {
  const [page, config, state] = await Promise.all([
    read('src/web/admin-ui/public/js/pages/screens.js'),
    read('src/web/admin-ui/public/js/core/config.js'),
    read('src/web/admin-ui/public/js/core/state.js')
  ]);

  assert.match(config, /sceneAssignments: '\/api\/screen-scene-assignments'/);
  assert.match(state, /sceneRevisions: \[\]/);
  assert.match(state, /sceneAssignments: \[\]/);
  assert.match(page, /api\.get\(`\$\{API\.scenes\}\/published\/revisions`\)/);
  assert.match(page, /api\.get\(API\.sceneAssignments\)/);
  assert.match(page, /filter\(\(revision\) => Number\(revision\.display_count\) === 1\)/);
  assert.match(page, /api\.put\(`\$\{API\.screens\}\/\$\{screen\.id\}\/scene-assignment`/);
  assert.match(page, /api\.delete\(`\$\{API\.screens\}\/\$\{screen\.id\}\/scene-assignment`\)/);
  assert.match(page, /Для них нужен Display Group/);
});
