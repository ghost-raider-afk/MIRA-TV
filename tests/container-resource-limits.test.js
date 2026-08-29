import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const LEGACY_CPU_KEYS = ['APP_CPU_LIMIT', 'DB_CPU_LIMIT', 'SFTP_CPU_LIMIT'];
const MEMORY_KEYS = ['APP_MEMORY_LIMIT', 'DB_MEMORY_LIMIT', 'SFTP_MEMORY_LIMIT'];
const PIDS_KEYS = ['APP_PIDS_LIMIT', 'DB_PIDS_LIMIT', 'SFTP_PIDS_LIMIT'];

test('canonical container configuration has no CPU quotas and keeps memory/PID hardening', async () => {
  const [compose, env] = await Promise.all([read('compose.yaml'), read('.env.example')]);

  assert.doesNotMatch(compose, /^\s*cpus\s*:/m);
  assert.doesNotMatch(env, /^[A-Z][A-Z0-9_]*CPU_LIMIT=/m);
  for (const key of LEGACY_CPU_KEYS) {
    assert.doesNotMatch(compose, new RegExp(`\\b${key}\\b`));
    assert.doesNotMatch(env, new RegExp(`^${key}=`, 'm'));
  }

  for (const key of MEMORY_KEYS) {
    assert.match(env, new RegExp(`^${key}=`, 'm'), `${key} must remain in .env.example`);
    assert.match(compose, new RegExp(`mem_limit: \\$\\{${key}\\}`), `${key} must remain wired into Compose`);
  }
  for (const key of PIDS_KEYS) {
    assert.match(env, new RegExp(`^${key}=`, 'm'), `${key} must remain in .env.example`);
    assert.match(compose, new RegExp(`pids_limit: \\$\\{${key}\\}`), `${key} must remain wired into Compose`);
  }
});

test('installer removes every legacy CPU key during existing environment migration', async () => {
  const installer = await read('menu-tv-2.sh');
  const cleanupBlock = installer.match(/cleanup_obsolete_env\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  const migrationBlock = installer.match(/ensure_sftp_env\(\) \{[\s\S]*?\n\}/)?.[0] || '';

  for (const key of LEGACY_CPU_KEYS) {
    assert.match(cleanupBlock, new RegExp(`\\b${key}\\b`), `${key} must be deleted from an existing .env`);
  }
  assert.match(cleanupBlock, /delete_env_value "\$env_file" "\$key"/);
  assert.match(migrationBlock, /merge_missing_env_from_example/);
  assert.match(migrationBlock, /cleanup_obsolete_env "\$env_file"/);
  assert.ok(
    migrationBlock.indexOf('merge_missing_env_from_example') < migrationBlock.indexOf('cleanup_obsolete_env "$env_file"'),
    'obsolete keys must be removed after the canonical environment merge'
  );
});
