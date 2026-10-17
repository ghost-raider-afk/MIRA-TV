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
  assert.match(screens, /reorderLocationGroups\(\)/);
});

test('Player publishes a frame on first missing LKG and after applied content changes', async () => {
  const [realtime, sync] = await Promise.all([
    read('src/realtime/player-realtime.js'),
    read('src/web/admin-ui/public/js/player/player-state-sync.js')
  ]);
  assert.match(realtime, /const screenId = Number\(session\.screen_id\)/);
  assert.match(realtime, /if \(forcePreview \|\| !screenPreviews\.has\(screenId\)\) send\(ws, \{ type:'preview\.request' \}\)/);
  assert.match(sync, /source !== 'last-known-good'.*changedNames\.length > 0/);
  assert.match(sync, /mira:player-preview-request/);
});

test('Player coalesces a content change that arrives while preview capture is in flight', async () => {
  const services = await read('src/web/admin-ui/public/js/player/player-background-services.js');
  assert.match(services, /let previewQueued = false/);
  assert.match(services, /const PREVIEW_SETTLE_MS = 1500;/);
  assert.match(services, /previewQueued = true;\s*schedulePreview\(\)/s);
  assert.match(services, /previewInFlight = false;\s*if \(previewQueued\) schedulePreview\(\)/s);
  assert.match(services, /previewTimer = setTimeout/);
  assert.doesNotMatch(services, /setInterval|previewCaptureIntervalMs/);
});
