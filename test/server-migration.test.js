import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
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
  for (const port of ['0', '022', '65536', '-1', 'abc', '22;id']) {
    assert.notEqual(runBash('migration_valid_port "$PORT"', { PORT: port }).status, 0, port);
  }
});

test('pinned host keys use port-aware OpenSSH known_hosts syntax', () => {
  const key = 'A'.repeat(68);
  const standard = runBash('migration_known_hosts_entry 198.51.100.10 22 "$KEY"', { KEY: key });
  assert.equal(standard.status, 0, standard.stderr);
  assert.equal(standard.stdout, '198.51.100.10 ssh-ed25519 ' + key + '\n');

  const alternative = runBash('migration_known_hosts_entry 198.51.100.10 2222 "$KEY"', { KEY: key });
  assert.equal(alternative.status, 0, alternative.stderr);
  assert.equal(alternative.stdout, '[198.51.100.10]:2222 ssh-ed25519 ' + key + '\n');
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
  assert.match(content, /migrate-discard\)/);
  assert.match(content, /migrate-prepare\)/);
  assert.doesNotMatch(helper, /StrictHostKeyChecking=no/);
});


test('migration preliminary archive is allowlisted and checksum-verified before extraction', () => {
  const base = mkdtempSync(path.join(tmpdir(), 'mira-transfer-test-'));
  try {
    const source = path.join(base, 'source');
    const target = path.join(base, 'target');
    mkdirSync(source);
    mkdirSync(target);
    const files = ['install.env', 'revision', 'database.dump', 'site-assets.tar.gz', 'letsencrypt.tar.gz'];
    for (const name of files) {
      const body = name === 'revision' ? 'a'.repeat(40) + '\n' : 'test-data-for-' + name;
      writeFileSync(path.join(source, name), body);
    }
    const checksums = files.map((name) =>
      createHash('sha256').update(readFileSync(path.join(source, name))).digest('hex') + '  ' + name).join('\n') + '\n';
    writeFileSync(path.join(source, 'SHA256SUMS'), checksums);
    // Actual nested archives also must be structurally valid.
    for (const name of ['site-assets.tar.gz', 'letsencrypt.tar.gz']) {
      const tar = spawnSync('tar', ['-czf', path.join(source, name), '-C', source, 'revision'], { encoding: 'utf8' });
      assert.equal(tar.status, 0, tar.stderr);
    }
    const updatedChecksums = files.map((name) =>
      createHash('sha256').update(readFileSync(path.join(source, name))).digest('hex') + '  ' + name).join('\n') + '\n';
    writeFileSync(path.join(source, 'SHA256SUMS'), updatedChecksums);
    const bundle = path.join(base, 'bundle.tar.gz');
    const contents = ['SHA256SUMS', ...files];
    assert.equal(spawnSync('tar', ['-czf', bundle, '-C', source, ...contents]).status, 0);
    assert.equal(runBash('migration_archive_validate "$ARCHIVE" "$TARGET"', { ARCHIVE: bundle, TARGET: target }).status, 0);
    writeFileSync(path.join(source, 'database.dump'), 'TAMPERED');
    assert.equal(spawnSync('tar', ['-czf', bundle, '-C', source, ...contents]).status, 0);
    assert.notEqual(runBash('migration_archive_validate "$ARCHIVE" "$TARGET"', { ARCHIVE: bundle, TARGET: target }).status, 0);
    writeFileSync(path.join(source, 'EXTRA'), 'unexpected');
    assert.equal(spawnSync('tar', ['-czf', bundle, '-C', source, ...contents, 'EXTRA']).status, 0);
    assert.notEqual(runBash('migration_archive_validate "$ARCHIVE" "$TARGET"', { ARCHIVE: bundle, TARGET: target }).status, 0);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('unknown remote migration commands fail closed', () => {
  const result = runBash('MIGRATION_SOURCE_STATE="$STATE"; SSH_ORIGINAL_COMMAND="whoami"; migration_source_remote', { STATE: '/definitely/not/a/source.state' });
  assert.notEqual(result.status, 0);
});

test('preliminary restoration cannot publish the public proxy', () => {
  const helper = readFileSync(migrationScript, 'utf8');
  const start = helper.indexOf('migration_target_prepare() (');
  assert.ok(start > 0);
  const restore = helper.slice(start);
  assert.match(restore, /docker compose up -d --wait db/);
  assert.match(restore, /docker compose up -d --build --wait app/);
  assert.match(restore, /wait_ready 30/);
  assert.match(restore, /docker compose stop app/);
  assert.match(restore, /pg_restore --exit-on-error/);
  assert.match(restore, /tv_device_sessions/);
  assert.doesNotMatch(restore, /docker compose up -d(?: --wait)? proxy\b/);
  assert.match(restore, /trap migration_prepare_rollback EXIT/);
});

test('target cleanup refuses to touch an installation without a migration ownership marker', () => {
  const result = runBash('require_root(){ :; }; die(){ printf "%s\\n" "$1" >&2; exit 1; }; MIGRATION_STATE_DIR=/definitely/nonexistent/mira-test; migration_target_reset');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Очистка существующей установки запрещена/);
});

test('abandoned target preparation has explicit recovery and never starts a public proxy', () => {
  const helper = readFileSync(migrationScript, 'utf8');
  const script = readFileSync(installer, 'utf8');
  assert.match(helper, /target-preparing/);
  assert.match(helper, /target-prepared/);
  assert.match(helper, /target-active/);
  assert.match(helper, /docker compose down -v --remove-orphans/);
  assert.match(script, /migrate-reset\)/);
});

test('target rejects existing MIRA-TV containers and volumes before staging', () => {
  const helper = readFileSync(migrationScript, 'utf8');
  assert.match(helper, /docker container inspect "\$container"/);
  assert.match(helper, /docker volume inspect "\$volume"/);
  assert.match(helper, /mira-tv-proxy-config-init/);
});
