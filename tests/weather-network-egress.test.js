import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('app uses public proxy network as default gateway for weather provider egress', async () => {
  const compose = await readFile(new URL('../compose.yaml', import.meta.url), 'utf8');
  const appStart = compose.indexOf('  app:\n');
  const proxyStart = compose.indexOf('  proxy-config-init:\n');
  assert.ok(appStart >= 0 && proxyStart > appStart, 'app service block must exist');
  const app = compose.slice(appStart, proxyStart);
  assert.match(app, /networks:\s*\n\s+mira-tv-internal:\s*\n\s+mira-tv-proxy:\s*\n\s+gw_priority:\s*1/);
  assert.match(compose, /mira-tv-internal:\s*\n\s+name:\s*mira-tv-internal\s*\n\s+internal:\s*true/);
});
