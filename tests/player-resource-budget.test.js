import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SERVICE_WORKER = new URL('../src/web/admin-ui/public/player-sw.js', import.meta.url);

test('cached TV video never copies the full asset into JavaScript memory for Range handling', async () => {
  const source = await readFile(SERVICE_WORKER, 'utf8');
  const match = source.match(/async function videoRequest\(request\) \{([\s\S]*?)\n\}/);
  assert.ok(match, 'videoRequest() must remain explicit and auditable');
  const implementation = match[1];

  assert.doesNotMatch(implementation, /arrayBuffer\s*\(/, 'video Range handling must not materialize the full cached video in JS memory');
  assert.doesNotMatch(implementation, /\.slice\s*\(/, 'video Range handling must not copy byte ranges in JS');
  assert.match(implementation, /if \(cached\)[\s\S]*return cached;/, 'cached video must be returned as the original streaming Response');
  assert.match(implementation, /request\.headers\.has\('range'\)/, 'uncached Range requests must stay on the native HTTP path');
});
