import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('fullscreen diagnostics flow from Player telemetry to TV management', async () => {
  const [fullscreen, repository, admin, screens] = await Promise.all([
    read('src/web/admin-ui/public/js/player/player-fullscreen.js'),
    read('src/db/player-telemetry-repository.js'),
    read('src/api/device/admin-routes.js'),
    read('src/web/admin-ui/public/js/pages/screens.js')
  ]);

  assert.match(fullscreen, /type:'fullscreen\.state'/);
  assert.match(fullscreen, /\/api\/device\/player-logs/);
  assert.match(repository, /listLatestPlayerFullscreenByDeviceIds/);
  assert.match(repository, /event_type = 'fullscreen\.state'/);
  assert.match(repository, /event_type <> 'fullscreen\.state'/);
  assert.match(admin, /player_fullscreen:/);
  assert.match(screens, /Режим экрана/);
  assert.match(screens, /Fullscreen API/);
});
