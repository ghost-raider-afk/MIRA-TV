import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const regexEscape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('installer is syntactically valid and delegates MIRA-TV runtime operations to Docker Compose', async () => {
  const [source, compose, pkg] = await Promise.all([
    readFile('mira-tv.sh', 'utf8'),
    readFile('compose.yaml', 'utf8'),
    readFile('package.json', 'utf8')
  ]);
  const syntax = spawnSync('bash', ['-n', 'mira-tv.sh'], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);

  const version = JSON.parse(pkg).version;
  const escapedVersion = regexEscape(version);

  assert.match(source, /^PROGRAM_NAME="MIRA-TV"$/m);
  assert.match(source, new RegExp(`^SCRIPT_VERSION="${escapedVersion}"$`, 'm'));
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
  assert.match(
    compose,
    /image: traefik:v3\.7\.12@sha256:5447d0eaf375d832b8f224f88db0e80c0a2d44554fc973e3ba72c3a52946cfcc/
  );
  assert.doesNotMatch(compose, /image: traefik:v3\.5(?:\s|$)/m);
  assert.doesNotMatch(compose, /external:\s*true/);
});

test('installer follows three-part MIRA-TV stable release tags', async () => {
  const source = await readFile('mira-tv.sh', 'utf8');
  assert.match(source, /v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+/);
  assert.doesNotMatch(source, /v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+/);
});

test('installer opens the menu by default and can elevate a process-substitution bootstrap safely', async () => {
  const [source, readme, installation] = await Promise.all([
    readFile('mira-tv.sh', 'utf8'),
    readFile('README.md', 'utf8'),
    readFile('docs/INSTALLATION.md', 'utf8')
  ]);

  assert.match(source, /case "\$\{1:-menu\}" in/);
  assert.match(source, /menu\) show_menu/);
  assert.match(source, /require_root install/);
  assert.match(source, /mktemp -t 'mira-tv\.bootstrap\.XXXXXX\.sh'/);
  assert.match(source, /sudo bash "\$tmp" "\$action"/);
  assert.match(source, /5\) Логи/);

  const bootstrap = 'bash <(curl -Ls https://raw.githubusercontent.com/ghost-raider-afk/MIRA-TV/main/mira-tv.sh)';
  assert.ok(readme.includes(bootstrap));
  assert.ok(installation.includes(bootstrap));
});

test('installer update is one guarded flow with temporary backup and automatic rollback', async () => {
  const source = await readFile('mira-tv.sh', 'utf8');

  assert.match(source, /2\) Проверить обновление/);
  assert.doesNotMatch(source, /6\) Проверить обновление/);
  assert.match(source, /У вас установлена последняя версия MIRA-TV/);
  assert.match(source, /Обновить\? \[y\/N\]/);

  assert.match(source, /^TEMP_BACKUP_DIR=""$/m);
  assert.match(source, /source\.tar\.gz/);
  assert.match(source, /git-revision/);
  assert.match(source, /database\.dump/);
  assert.match(source, /pg_dump/);
  assert.match(source, /pg_restore/);
  assert.match(source, /restore_temporary_backup/);
  assert.match(source, /recover_failed_update/);
  assert.match(source, /предыдущая версия, настройки и база данных автоматически восстановлены/);

  const backupFunction = source.match(/create_temporary_backup\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(backupFunction, /installer_source="\$\{INSTALL_DIR\}\/mira-tv\.sh"/);
  assert.match(backupFunction, /installer_source="\$LAUNCHER_PATH"/);
  assert.doesNotMatch(backupFunction, /BASH_SOURCE/);

  assert.match(source, /reset-admin-password\.js/);
  assert.match(source, /Удалить приложение\?'; then/);
  assert.match(source, /Удалить приложение и ВСЕ данные\?'; then/);
  assert.match(source, /\[YES\/NO\]/);
});
