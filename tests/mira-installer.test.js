import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('installer is syntactically valid and has only MIRA-TV runtime names', async () => {
  const source = await readFile('mira-tv.sh','utf8');
  const syntax = spawnSync('bash',['-n','mira-tv.sh'],{encoding:'utf8'});
  assert.equal(syntax.status,0,syntax.stderr);
  assert.match(source,/PROGRAM_NAME="mira-tv"/);
  assert.match(source,/COMPOSE_PROJECT="mira-tv"/);
  assert.match(source,/LAUNCHER_PATH="\/usr\/local\/bin\/mira-tv"/);
  assert.match(source,/v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+/);
  assert.doesNotMatch(source,/:2022|\/srv\/.*transport|container_name:.*file-transfer/i);
});
