import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, chmodSync } from 'node:fs';
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


test('renewable SSH lease extends active transfers but never passes the hard deadline', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mira-ssh-lease-'));
  try {
    const state = path.join(dir, 'source.state');
    const now = Math.floor(Date.now() / 1000);
    const hard = now + 7200;
    writeFileSync(state, 'a'.repeat(24) + '\n' + (now + 60) + '\n' + hard + '\n', { mode: 0o600 });
    const active = runBash('MIGRATION_STATE_DIR="$DIR"; MIGRATION_SOURCE_STATE="$STATE"; migration_source_touch_lease', { DIR: dir, STATE: state });
    assert.equal(active.status, 0, active.stderr);
    const lines = readFileSync(state, 'utf8').trim().split('\n');
    assert.equal(Number(lines[1]), hard);
    assert.equal(Number(lines[2]), hard);

    writeFileSync(state, 'a'.repeat(24) + '\n' + (now - 60) + '\n' + hard + '\n');
    const expired = runBash('MIGRATION_STATE_DIR="$DIR"; MIGRATION_SOURCE_STATE="$STATE"; migration_source_touch_lease', { DIR: dir, STATE: state });
    assert.notEqual(expired.status, 0, 'expired keys must never renew');

    writeFileSync(state, 'a'.repeat(24) + '\n' + (now + 3600) + '\n' + (now - 1) + '\n');
    const hardExpired = runBash('MIGRATION_STATE_DIR="$DIR"; MIGRATION_SOURCE_STATE="$STATE"; migration_source_touch_lease', { DIR: dir, STATE: state });
    assert.notEqual(hardExpired.status, 0, 'hard deadline must be enforced');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('SSH lease is renewed during snapshot and expires when idle', () => {
  const source = readFileSync(migrationScript, 'utf8');
  assert.match(source, /MIGRATION_IDLE_LEASE_SECONDS=86400/);
  assert.match(source, /MIGRATION_MAX_KEY_SECONDS=604800/);
  assert.match(source, /while sleep 300; do[\s\S]*migration_source_touch_lease \|\| exit 1/);
  assert.match(source, /case .*SSH_ORIGINAL_COMMAND/);
  assert.match(source, /probe\)/);
  assert.match(source, /snapshot\)/);
  assert.doesNotMatch(source, /date -u -d '\+2 hours'/);
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
    const files = ['install.env', 'revision', 'database.dump', 'site-assets.tar.gz', 'letsencrypt.tar.gz', 'snapshot-kind'];
    for (const name of files) {
      const body = name === 'revision' ? 'a'.repeat(40) + '\n' : name === 'snapshot-kind' ? 'preliminary\n' : 'test-data-for-' + name;
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


test('source freezes the writer before final snapshot and allows explicit guarded recovery', () => {
  const helper = readFileSync(migrationScript, 'utf8');
  const script = readFileSync(installer, 'utf8');
  assert.match(helper, /migration_source_frozen_verified\(\)/);
  assert.match(helper, /docker update --restart=no mira-tv/);
  assert.match(helper, /docker compose stop -t 30 app/);
  assert.match(helper, /final\) migration_source_frozen_verified \|\| return 1/);
  assert.match(helper, /final-snapshot\)/);
  assert.match(helper, /migration_source_resume\(\)/);
  assert.match(helper, /source-handoff/);
  assert.match(script, /migration_guard_source_writable\(\)/);
  assert.match(script, /restart_app\(\)[^\n]*migration_guard_source_writable/);
  assert.match(script, /migrate-resume\)/);
});

test('snapshot kind must be present and integrity protected', () => {
  const base = mkdtempSync(path.join(tmpdir(), 'mira-kind-test-'));
  try {
    const files = ['SHA256SUMS', 'install.env', 'revision', 'database.dump', 'site-assets.tar.gz', 'letsencrypt.tar.gz'];
    for (const name of files) writeFileSync(path.join(base, name), name);
    const archive = path.join(base, 'bad.tar.gz');
    const result = spawnSync('tar', ['-czf', archive, '-C', base, ...files]);
    assert.equal(result.status, 0);
    assert.notEqual(runBash('migration_archive_validate "$ARCHIVE" "$TARGET"', { ARCHIVE: archive, TARGET: base }).status, 0);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('final restoration never merges with the preliminary database', () => {
  const helper = readFileSync(migrationScript, 'utf8');
  const start = helper.indexOf('migration_target_restore_final() {');
  const stop = helper.indexOf('\nmigration_target_final_sync() {', start);
  assert.ok(start > 0 && stop > start);
  const restore = helper.slice(start, stop);
  assert.match(restore, /dropdb --if-exists --force/);
  assert.match(restore, /createdb -U/);
  assert.match(restore, /pg_restore --exit-on-error/);
  assert.match(restore, /find "\$SITE_ASSETS_ROOT" -mindepth 1 -delete/);
  assert.match(restore, /tv_device_sessions/);
  assert.doesNotMatch(restore, /docker compose up -d.*proxy/);
  assert.doesNotMatch(restore, /docker compose up -d.*app/);
});

test('final backup is acquired exclusively after source freeze and checked against source secrets', () => {
  const helper = readFileSync(migrationScript, 'utf8');
  assert.match(helper, /migration_target_request freeze/);
  assert.match(helper, /migration_target_request final-snapshot/);
  assert.match(helper, /migration_archive_validate "\$work\/bundle.tar.gz"/);
  assert.match(helper, /SESSION_SECRET=/);
  assert.match(helper, /migration_target_request resume/);
  assert.match(helper, /migration_target_restore_final/);
  assert.doesNotMatch(helper, /StrictHostKeyChecking=no/);
});


test('arming the source is idempotent but permanently fences local recovery', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mira-arm-'));
  try {
    const script = [
      'MIGRATION_STATE_DIR="$DIR"',
      'migration_source_frozen_verified(){ return 0; }',
      'migration_source_arm'
    ].join('; ');
    const first = runBash(script, { DIR: dir });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stdout.trim(), 'MIRA-TV-SOURCE-ARMED-1');
    assert.equal(readFileSync(path.join(dir, 'source-handoff'), 'utf8').trim(), 'armed');
    const second = runBash(script, { DIR: dir });
    assert.equal(second.status, 0, second.stderr);
    assert.equal(readFileSync(path.join(dir, 'source-handoff'), 'utf8').trim(), 'armed');
    const unsafe = runBash(
      'die(){ printf "%s\\n" "$1" >&2; exit 1; }; MIGRATION_STATE_DIR="$DIR"; migration_source_resume',
      { DIR: dir }
    );
    assert.notEqual(unsafe.status, 0);
    assert.match(unsafe.stderr, /старую БД в запись запрещено/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('handoff retains proper HTTPS SNI and does not disable TLS verification', () => {
  const helper = readFileSync(migrationScript, 'utf8');
  const start = helper.indexOf('migration_source_handoff() {');
  const stop = helper.indexOf('\nmigration_source_snapshot() {', start);
  assert.ok(start > 0 && stop > start);
  const proxy = helper.slice(start, stop);
  assert.match(proxy, /migration_source_frozen_verified/);
  assert.match(proxy, /curl --noproxy/);
  assert.match(proxy, /--resolve "\$domain:443:\$ip"/);
  assert.match(proxy, /serverName:/);
  assert.match(proxy, /serversTransport: migration-server/);
  assert.match(proxy, /dynamic.before-migration.yml/);
  assert.match(proxy, /MIRA-TV-PROXY-ACTIVE-1/);
  assert.doesNotMatch(proxy, /insecureSkipVerify|--insecure|-k\b/);
});

test('new target cannot serve traffic before source is irreversibly armed', () => {
  const helper = readFileSync(migrationScript, 'utf8');
  const start = helper.indexOf('migration_target_publish() {');
  const stop = helper.indexOf('\nmigration_target_finalize() {', start);
  assert.ok(start > 0 && stop > start);
  const publish = helper.slice(start, stop);
  const arm = publish.indexOf('migration_target_request arm');
  const startup = publish.indexOf('docker compose up -d --build --wait proxy');
  const handoff = publish.indexOf('migration_target_request "handoff $ip"');
  assert.ok(arm >= 0 && startup > arm && handoff > startup);
  assert.match(publish, /target-final-restored/);
  assert.match(publish, /MIRA-TV-SOURCE-FROZEN-1/);
  assert.match(publish, /MIRA-TV-PROXY-ACTIVE-1/);
  assert.match(publish, /migration_target_request revoke/);
  assert.doesNotMatch(publish, /migration_source_resume/);
});

test('target proxy retirement is not silently claimed without verified DNS transition', () => {
  const helper = readFileSync(migrationScript, 'utf8');
  assert.match(helper, /Обновите DNS A-запись/);
  assert.match(helper, /Прокси пока не отключать/);
});


test('proxy retirement DNS guard rejects old A addresses and IPv6', () => {
  const base = mkdtempSync(path.join(tmpdir(), 'mira-dns-'));
  try {
    const script = path.join(base, 'dig');
    writeFileSync(script, '#!/bin/sh\ncase "$2" in A) printf "%s\\n" "$DIG_A";; AAAA) printf "%s" "$DIG_AAAA";; esac\n');
    chmodSync(script, 0o755);
    const command = 'migration_proxy_dns_points_to mira.example.test 198.51.100.15';
    const env = { PATH: base + ':' + process.env.PATH, DIG_A: '198.51.100.15', DIG_AAAA: '' };
    assert.equal(runBash(command, env).status, 0);
    assert.notEqual(runBash(command, { ...env, DIG_A: '198.51.100.9' }).status, 0);
    assert.notEqual(runBash(command, { ...env, DIG_A: '198.51.100.15\n198.51.100.9' }).status, 0);
    assert.notEqual(runBash(command, { ...env, DIG_AAAA: '2001:db8::1' }).status, 0);
    assert.notEqual(runBash(command, { ...env, DIG_A: '' }).status, 0);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('proxy retirement has a safety period and cannot restart the old app', () => {
  const source = readFileSync(migrationScript, 'utf8');
  const script = readFileSync(installer, 'utf8');
  assert.match(source, /MIGRATION_PROXY_QUIET_SECONDS=1209600/);
  assert.match(source, /migration_source_frozen_verified \\|\\| return 0/);
  assert.match(source, /ss -Htn state established/);
  assert.match(source, /migration_proxy_network_bytes/);
  assert.match(source, /docker update --restart=no mira-tv-proxy/);
  assert.match(source, /docker stop --time 30 mira-tv-proxy/);
  assert.match(source, /OnCalendar=hourly/);
  assert.match(script, /migrate-proxy-check\\)/);
});


test('migration source cannot prepare new keys after it has become a proxy', () => {
  const helper = readFileSync(migrationScript, 'utf8');
  const start = helper.indexOf('migration_source_setup() {');
  const end = helper.indexOf('\nmigration_source_cancel() {', start);
  const section = helper.slice(start, end);
  assert.match(section, /source-frozen/);
  assert.match(section, /source-handoff/);
  assert.match(section, /proxy-retired/);
});

test('AAAA lookup errors keep the old proxy running', () => {
  const base = mkdtempSync(path.join(tmpdir(), 'mira-dns-error-'));
  try {
    const script = path.join(base, 'dig');
    writeFileSync(script, '#!/bin/sh\nif [ "$2" = AAAA ]; then exit 2; fi\nprintf "198.51.100.15\\n"\n');
    chmodSync(script, 0o755);
    const result = runBash('migration_proxy_dns_points_to mira.example.test 198.51.100.15', { PATH: base + ':' + process.env.PATH });
    assert.notEqual(result.status, 0, 'DNS lookup failure is not an empty AAAA answer');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('revoking migration access preserves unrelated SSH authorized_keys atomically', () => {
  const source = readFileSync(migrationScript, 'utf8');
  const start = source.indexOf('migration_source_clear_key() {');
  const end = source.indexOf('\nmigration_source_touch_lease() {', start);
  const section = source.slice(start, end);
  assert.match(section, /awk 'index\(\$0, " # MIRA-TV-MIGRATION-"\) == 0/);
  assert.match(section, /mv -f -- "\$filtered" "\$key_file"/);
  assert.doesNotMatch(section, /cat "\$filtered" > "\$key_file"/);
});


test('target refuses to delete a final copy unless source has actually resumed', () => {
  const helper = readFileSync(migrationScript, 'utf8');
  const start = helper.indexOf('migration_target_reset() {');
  const reset = helper.slice(start);
  assert.match(reset, /migration_target_request role/);
  assert.match(reset, /MIRA-TV-SOURCE-LIVE-1/);
  assert.match(reset, /target-active/);
  assert.match(helper, /MIRA-TV-SOURCE-FENCED-1/);
});


test('the new-server flow proceeds automatically from verified transfer through cutover', () => {
  const helper = readFileSync(migrationScript, 'utf8');
  const start = helper.indexOf('migration_target_probe() {');
  const end = helper.indexOf('\nmigration_target_save_connection() {', start);
  const probe = helper.slice(start, end);
  assert.match(probe, /migration_target_stage/);
  assert.match(probe, /migration_target_save_connection/);
  assert.match(probe, /migration_target_prepare/);
  assert.match(probe, /migration_target_finalize/);
  assert.ok(probe.indexOf('migration_target_prepare') < probe.indexOf('migration_target_finalize'));
});
