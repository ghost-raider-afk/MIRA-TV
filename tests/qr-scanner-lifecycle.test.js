import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('QR scanner owns camera and local decoder lifecycle and is disposed by SPA router', async () => {
  const [scanner, router, html] = await Promise.all([
    read('src/web/admin-ui/public/js/pages/connect-tv.js'),
    read('src/web/admin-ui/public/js/core/router.js'),
    read('src/web/admin-ui/public/connect-tv.html')
  ]);

  assert.match(scanner, /window\.isSecureContext/);
  assert.match(scanner, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(scanner, /window\.jsQR/);
  assert.match(scanner, /const JS_QR_SRC = '\/vendor\/jsQR\.js'/);
  assert.match(scanner, /ensureJsQr/);
  assert.match(scanner, /document\.head\.append\(script\)/);
  assert.doesNotMatch(html, /<script src="\/vendor\/jsQR\.js"/);
  assert.match(scanner, /waitForVideoFrame/);
  assert.match(scanner, /facingMode:\s*\{ ideal: 'environment' \}/);
  assert.match(scanner, /requestAnimationFrame\(\(next\) => \{ void scanLoop\(next\); \}\)/);
  assert.match(scanner, /return \{\s*dispose\(\)/s);
  assert.match(scanner, /removeEventListener\('visibilitychange'/);
  assert.match(scanner, /stopCamera\(\)/);
  assert.match(router, /lifecycle = normaliseLifecycle\(await mountPage\(page\)\)/);
  assert.match(router, /await lifecycle\.dispose\(\)/);
});
