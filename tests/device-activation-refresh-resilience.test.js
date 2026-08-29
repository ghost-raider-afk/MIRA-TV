import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const playerUrl = new URL('../src/web/admin-ui/public/js/player/player.js', import.meta.url);

async function playerSource() {
  return readFile(playerUrl, 'utf8');
}

test('pending TV activation survives reloads and migrates the old session-only record', async () => {
  const source = await playerSource();
  assert.match(source, /const ACTIVATION_STORAGE_KEY = 'tv-menu\.device-activation\.v2'/);
  assert.match(source, /localStorage\.getItem\(ACTIVATION_STORAGE_KEY\)/);
  assert.match(source, /localStorage\.setItem\(ACTIVATION_STORAGE_KEY/);
  assert.match(source, /LEGACY_ACTIVATION_STORAGE_KEY/);
  assert.match(source, /sessionStorage\.getItem\(LEGACY_ACTIVATION_STORAGE_KEY\)/);
  assert.match(source, /saveActivation\(legacy\)/);
});

test('failed QR refresh keeps the previous valid pairing instead of reporting a fake disconnect', async () => {
  const source = await playerSource();
  assert.match(source, /const previous = activationFromStorage\(\)/);
  assert.match(source, /if \(usableActivation\(previous\)\) \{[\s\S]*showPairing\(previous\);[\s\S]*schedulePoll\(previous\);/);
  assert.match(source, /Текущий QR продолжает работать/);
  assert.match(source, /Текущий код продолжает работать и остаётся связан с сервером/);
});

test('activation rate limit is distinguished from a network outage and respects Retry-After', async () => {
  const source = await playerSource();
  assert.match(source, /response\?\.headers\?\.get\?\.\('retry-after'\)/);
  assert.match(source, /error\.status = response\.status/);
  assert.match(source, /error\?\.status === 429/);
  assert.match(source, /Слишком много запросов на обновление QR/);
  assert.match(source, /delay \* 1000/);
});
