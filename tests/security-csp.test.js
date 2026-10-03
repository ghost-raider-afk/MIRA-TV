import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const exists = async (path) => access(path).then(() => true, () => false);

test('browser CSP does not permit eval or WebAssembly compilation', async () => {
  const server = await readFile('src/server.js', 'utf8');
  assert.match(server, /scriptSrc:\s*\["'self'"\]/);
  assert.doesNotMatch(server, /wasm-unsafe-eval|unsafe-eval/);
});

test('retired motion WASM build tooling is not shipped or copied into production image', async () => {
  const dockerfile = await readFile('Dockerfile', 'utf8');
  assert.equal(await exists('scripts/build-wasm.sh'), false);
  assert.doesNotMatch(dockerfile, /COPY\s+scripts(?:\s|\/)/);
});
