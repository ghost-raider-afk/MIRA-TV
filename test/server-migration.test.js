import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationScript = path.join(root, 'scripts/server-migration.sh');
const installer = path.join(root, 'mira-tv.sh');

function runBash(code, env = {}) {
  return spawnSync('bash', ['-c', 'source "$MIGRATION_SCRIPT"; ' + code], {
    env: { ...process.env, MIGRATION_SCRIPT: migrationScript, ...env },
    encoding: 'utf8',
    timeout: 5000
  });
}

test('migration helper and installer pass bash syntax checks', () => {
  for (const filename of [installer, migrationScript]) {
    const result = spawnSync('bash', ['-n', filename], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});

test('SSH destination accepts only canonical public IPv4 input', () => {
  for (const address of ['1.2.3.4', '198.51.100.27', '203.0.113.9']) {
    const result = runBash('migration_valid_ipv4 "$IP"', { IP: address });
    assert.equal(result.status, 0, address + ': ' + result.stderr);
  }
  for (const address of ['0.0.0.0', '256.1.1.1', '192.168.001.1', '1.2.3', '1.2.3.4;id', '-1.2.3.4']) {
    const result = runBash('migration_valid_ipv4 "$IP"', { IP: address });
    assert.notEqual(result.status, 0, address);
  }
});

test('SSH port validation enforces the actual TCP port range', () => {
  for (const port of ['1', '22', '2222', '65535']) {
    assert.equal(runBash('migration_valid_port "$PORT"', { PORT: port }).status, 0, port);
  }
  for (const port of ['0', '65536', '-1', 'abc', '22;id']) {
    assert.notEqual(runBash('migration_valid_port "$PORT"', { PORT: port }).status, 0, port);
  }
});

test('SSH migration is strictly opt-in, limited to a forced command and probe', () => {
  const helper = readFileSync(migrationScript, 'utf8');
  const content = readFileSync(installer, 'utf8');
  assert.match(helper, /restrict,expiry-time=/);
  assert.match(helper, /SSH_ORIGINAL_COMMAND/);
  assert.match(helper, /StrictHostKeyChecking=yes/);
  assert.match(helper, /HostKeyAlgorithms=ssh-ed25519/);
  assert.match(helper, /case "\$SSH_ORIGINAL_COMMAND" in/);
  assert.match(helper, /probe\)/);
  assert.match(content, /9\) migration_menu/);
  assert.match(content, /migrate-source\)/);
  assert.match(content, /migrate-target\)/);
  assert.doesNotMatch(helper, /StrictHostKeyChecking=no/);
});

test('unknown remote migration commands fail closed', () => {
  const result = runBash('MIGRATION_SOURCE_STATE="$STATE"; SSH_ORIGINAL_COMMAND="whoami"; migration_source_remote', { STATE: '/definitely/not/a/source.state' });
  assert.notEqual(result.status, 0);
});
