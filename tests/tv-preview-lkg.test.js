import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin preview endpoints are passive LKG readers', async () => {
  const [deviceAdmin, manager] = await Promise.all([
    read('src/api/device/admin-routes.js'),
    read('src/api/managers/view-routes.js')
  ]);
  assert.doesNotMatch(deviceAdmin, /freshScreenPreview|requestScreenPreview/);
  assert.match(deviceAdmin, /preview_available:Boolean\(preview\)/);
  assert.match(deviceAdmin, /screenPreview\?\.\(screenId\)/);
  assert.doesNotMatch(manager, /requestedPreview|requestScreenPreview/);
  assert.match(manager, /screenPreview\?\.\(id\)/);
});

test('TV cards keep the same image across status-only refreshes', async () => {
  const screens = await read('src/web/admin-ui/public/js/pages/screens.js');
  assert.doesNotMatch(screens, /requestFresh/);
  assert.match(screens, /const faceKey = String\(binding\?\.preview_updated_at \|\| ''\)/);
  assert.doesNotMatch(screens, /faceKey = `\$\{status\.key\}/);
});

test('Player publishes a frame on first missing LKG and after applied content changes', async () => {
  const [realtime, sync] = await Promise.all([
    read('src/realtime/player-realtime.js'),
    read('src/web/admin-ui/public/js/player/player-state-sync.js')
  ]);
  assert.match(realtime, /!screenPreviews\.has\(Number\(session\.screen_id\)\).*preview\.request/);
  assert.match(sync, /source !== 'last-known-good'.*changedNames\.length > 0/);
  assert.match(sync, /mira:player-preview-request/);
});
