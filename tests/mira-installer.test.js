import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('installer is syntactically valid and delegates MIRA-TV runtime operations to Docker Compose', async () => {
  const [source, compose] = await Promise.all([
    readFile('mira-tv.sh', 'utf8'),
    readFile('compose.yaml', 'utf8')
  ]);
  const syntax = spawnSync('bash', ['-n', 'mira-tv.sh'], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);

  assert.match(source, /^PROGRAM_NAME="MIRA-TV"$/m);
  assert.match(source, /^SCRIPT_VERSION="1\.0\.0"$/m);
  assert.match(source, /^INSTALL_DIR="\/opt\/MIRA-TV"$/m);
  assert.match(source, /^LAUNCHER_PATH="\/usr\/local\/bin\/mira-tv"$/m);
  assert.match(source, /docker compose up -d --build --wait/);
  assert.match(source, /docker compose config --quiet/);
  assert.doesNotMatch(source, /\bdocker\s+(?:run|network|create|rm|stop|start)\b/);
  assert.doesNotMatch(source, /COMPOSE_PROJECT=/);
  assert.doesNotMatch(source, /:2022|file-transfer/i);

  assert.match(compose, /^name: mira-tv$/m);
  assert.match(compose, /^  proxy:$/m);
  assert.match(compose, /container_name: mira-tv-proxy/);
  assert.doesNotMatch(compose, /external:\s*true/);
});

test('installer follows three-part MIRA-TV stable release tags', async () => {
  const source = await readFile('mira-tv.sh', 'utf8');
  assert.match(source, /v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+/);
  assert.doesNotMatch(source, /v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+/);
});
