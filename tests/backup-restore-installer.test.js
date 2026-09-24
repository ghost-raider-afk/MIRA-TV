import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const installer = readFileSync(new URL('../mira-tv.sh', import.meta.url), 'utf8');

test('installer remains valid bash after backup/restore extension', () => {
  const result = spawnSync('bash', ['-n', 'mira-tv.sh'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('full backup contract preserves server identity and checks integrity', () => {
  assert.match(installer, /FULL_BACKUP_FORMAT_VERSION="1"/);
  assert.match(installer, /^BACKUP_DIR="\/var\/backups\/mira-tv"$/m);
  assert.doesNotMatch(installer, /BACKUP_DIR="\$\{PERSIST_DIR\}/);
  assert.match(installer, /sha256sum manifest\.env \.env database\.dump site-assets\.tar\.gz letsencrypt\.tar\.gz/);
  assert.match(installer, /pg_dump .*--format=custom --no-owner --no-privileges/);
  assert.match(installer, /rev-parse "v\\\$\{version\}\^\{commit\}"/);
  assert.match(installer, /Текущий код не совпадает со стабильным релизом/);
  assert.match(installer, /git -C "\$INSTALL_DIR" diff --quiet/);
  assert.match(installer, /backup_persistent_volume_to 'site-assets'/);
  assert.match(installer, /backup_persistent_volume_to 'letsencrypt'/);
  assert.match(installer, /cp "\$INSTALL_DIR\/\.env" "\$FULL_BACKUP_WORKDIR\/\.env"/);
});

test('full restore is exact and refuses an existing installation', () => {
  assert.match(installer, /Восстановление полного сервера разрешено только на чистую установку/);
  assert.match(installer, /git clone --depth 1 --branch "\$tag"/);
  assert.match(installer, /Git revision релиза не совпадает с revision в backup/);
  assert.match(installer, /restore_database_exact "\$FULL_BACKUP_WORKDIR\/database\.dump"/);
  assert.match(installer, /restore_persistent_volume_from 'site-assets'/);
  assert.match(installer, /restore_persistent_volume_from 'letsencrypt'/);
  assert.match(installer, /После переключения DNS телевизоры продолжат работу с прежними идентификаторами и привязками/);
});

test('backup helper stays inside Docker Compose and verifier rejects unexpected members', () => {
  assert.doesNotMatch(installer, /\bdocker\s+run\b/);
  assert.match(installer, /compose run --rm --no-deps -T -e BACKUP_TARGET=/);
  assert.match(installer, /Структура резервной копии не соответствует формату MIRA-TV/);
  assert.match(installer, /tar --no-same-owner --no-same-permissions -xzf/);
  assert.match(installer, /Список контрольных сумм резервной копии некорректен/);
});
