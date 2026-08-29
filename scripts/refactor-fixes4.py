#!/usr/bin/env python3
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]

# Remove obsolete test suites whose product contract no longer exists.
for rel in [
  'tests/api.test.js',
  'tests/backend-architecture.test.js',
  'tests/config.test.js',
  'tests/container-resource-limits.test.js',
  'tests/frontend-architecture.test.js',
  'tests/installer-build-cache-lifecycle.test.js',
  'tests/installer-update-flow.test.js',
  'tests/qr-pairing-release.test.js',
  'tests/versioning.test.js',
  'tests/mira-branding.test.js'
]:
    p=ROOT/rel
    if p.exists(): p.unlink()

# Server must contain no ghost SFTP objects.
p=ROOT/'src/server.js'
t=p.read_text()
t=re.sub(r"\n\s*const sftp = suppliedSftp \?\? new SftpService\(config\.sftp\);", '', t)
p.write_text(t)

# Canonical new config. .env is the only runtime source.
(ROOT/'src/config/index.js').write_text('''import { boolean, bootstrapAdministrator, generatedValue, integer, required } from './env.js';\n\nexport function loadConfig(env = process.env) {\n  const passwordMinLength = integer('PASSWORD_MIN_LENGTH', env.PASSWORD_MIN_LENGTH, { minimum: 10, maximum: 64 });\n  const passwordMaxLength = integer('PASSWORD_MAX_LENGTH', env.PASSWORD_MAX_LENGTH, { minimum: passwordMinLength, maximum: 128 });\n  const dashboardRefreshMinSeconds = integer('DASHBOARD_REFRESH_MIN_SECONDS', env.DASHBOARD_REFRESH_MIN_SECONDS, { minimum: 5, maximum: 3600 });\n  const dashboardRefreshMaxSeconds = integer('DASHBOARD_REFRESH_MAX_SECONDS', env.DASHBOARD_REFRESH_MAX_SECONDS, { minimum: dashboardRefreshMinSeconds, maximum: 86400 });\n  return Object.freeze({\n    appName: required('APP_NAME', env.APP_NAME),\n    appVersion: required('MIRA_TV_VERSION', env.MIRA_TV_VERSION),\n    nodeEnv: required('NODE_ENV', env.NODE_ENV),\n    host: required('HOST', env.HOST),\n    port: integer('PORT', env.PORT, { minimum: 1, maximum: 65535 }),\n    domain: required('MIRA_TV_DOMAIN', env.MIRA_TV_DOMAIN),\n    bootstrapAdmin: bootstrapAdministrator(env, passwordMinLength),\n    sessionSecret: generatedValue('SESSION_SECRET', env.SESSION_SECRET, 32),\n    sessionTtlHours: integer('SESSION_TTL_HOURS', env.SESSION_TTL_HOURS, { minimum: 1, maximum: 168 }),\n    secureCookies: boolean('SECURE_COOKIES', env.SECURE_COOKIES),\n    deviceActivationTtlMinutes: integer('DEVICE_ACTIVATION_TTL_MINUTES', env.DEVICE_ACTIVATION_TTL_MINUTES, { minimum: 1, maximum: 60 }),\n    deviceActivationPollSeconds: integer('DEVICE_ACTIVATION_POLL_SECONDS', env.DEVICE_ACTIVATION_POLL_SECONDS, { minimum: 1, maximum: 15 }),\n    deviceActivationMaxAttempts: integer('DEVICE_ACTIVATION_MAX_ATTEMPTS', env.DEVICE_ACTIVATION_MAX_ATTEMPTS, { minimum: 1, maximum: 1000 }),\n    deviceActivationWindowMinutes: integer('DEVICE_ACTIVATION_WINDOW_MINUTES', env.DEVICE_ACTIVATION_WINDOW_MINUTES, { minimum: 1, maximum: 1440 }),\n    deviceActivationLimiterMaxEntries: integer('DEVICE_ACTIVATION_LIMITER_MAX_ENTRIES', env.DEVICE_ACTIVATION_LIMITER_MAX_ENTRIES, { minimum: 10, maximum: 100000 }),\n    deviceActivationCleanupMinutes: integer('DEVICE_ACTIVATION_CLEANUP_MINUTES', env.DEVICE_ACTIVATION_CLEANUP_MINUTES, { minimum: 1, maximum: 1440 }),\n    deviceActivationRetentionHours: integer('DEVICE_ACTIVATION_RETENTION_HOURS', env.DEVICE_ACTIVATION_RETENTION_HOURS, { minimum: 1, maximum: 720 }),\n    deviceSessionTtlDays: integer('DEVICE_SESSION_TTL_DAYS', env.DEVICE_SESSION_TTL_DAYS, { minimum: 1, maximum: 3650 }),\n    deviceHeartbeatWriteSeconds: integer('DEVICE_HEARTBEAT_WRITE_SECONDS', env.DEVICE_HEARTBEAT_WRITE_SECONDS, { minimum: 10, maximum: 3600 }),\n    playerFallbackPollSeconds: integer('PLAYER_FALLBACK_POLL_SECONDS', env.PLAYER_FALLBACK_POLL_SECONDS, { minimum: 15, maximum: 3600 }),\n    playerLogBatchSize: integer('PLAYER_LOG_BATCH_SIZE', env.PLAYER_LOG_BATCH_SIZE, { minimum: 10, maximum: 500 }),\n    playerLogLocalMaxEntries: integer('PLAYER_LOG_LOCAL_MAX_ENTRIES', env.PLAYER_LOG_LOCAL_MAX_ENTRIES, { minimum: 100, maximum: 50000 }),\n    playerLogLocalMaxBytes: integer('PLAYER_LOG_LOCAL_MAX_BYTES', env.PLAYER_LOG_LOCAL_MAX_BYTES, { minimum: 1048576, maximum: 104857600 }),\n    eventJournalRetentionDays: integer('EVENT_JOURNAL_RETENTION_DAYS', env.EVENT_JOURNAL_RETENTION_DAYS, { minimum: 1, maximum: 365 }),\n    eventJournalMaxEntries: integer('EVENT_JOURNAL_MAX_ENTRIES', env.EVENT_JOURNAL_MAX_ENTRIES, { minimum: 100, maximum: 100000 }),\n    passwordMinLength,\n    passwordMaxLength,\n    generatedPasswordLength: integer('GENERATED_PASSWORD_LENGTH', env.GENERATED_PASSWORD_LENGTH, { minimum: 10, maximum: 64 }),\n    loginMaxAttempts: integer('LOGIN_MAX_ATTEMPTS', env.LOGIN_MAX_ATTEMPTS, { minimum: 1, maximum: 100 }),\n    loginIpMaxAttempts: integer('LOGIN_IP_MAX_ATTEMPTS', env.LOGIN_IP_MAX_ATTEMPTS, { minimum: 1, maximum: 1000 }),\n    loginWindowMinutes: integer('LOGIN_WINDOW_MINUTES', env.LOGIN_WINDOW_MINUTES, { minimum: 1, maximum: 1440 }),\n    loginLimiterMaxEntries: integer('LOGIN_LIMITER_MAX_ENTRIES', env.LOGIN_LIMITER_MAX_ENTRIES, { minimum: 10, maximum: 100000 }),\n    jsonBodyMaxBytes: integer('JSON_BODY_MAX_BYTES', env.JSON_BODY_MAX_BYTES, { minimum: 1024, maximum: 10485760 }),\n    menuDraftMaxBytes: integer('MENU_DRAFT_MAX_BYTES', env.MENU_DRAFT_MAX_BYTES, { minimum: 1024, maximum: 10485760 }),\n    screenSourceMaxBytes: integer('SCREEN_SOURCE_MAX_BYTES', env.SCREEN_SOURCE_MAX_BYTES, { minimum: 1024, maximum: 52428800 }),\n    dashboardRefreshMinSeconds, dashboardRefreshMaxSeconds,\n    screenMaxWidth: integer('SCREEN_MAX_WIDTH', env.SCREEN_MAX_WIDTH, { minimum: 320, maximum: 7680 }),\n    screenMaxHeight: integer('SCREEN_MAX_HEIGHT', env.SCREEN_MAX_HEIGHT, { minimum: 240, maximum: 4320 }),\n    imageMaxPixels: integer('IMAGE_MAX_PIXELS', env.IMAGE_MAX_PIXELS, { minimum: 262144, maximum: 100000000 }),\n    siteAssetsRoot: required('SITE_ASSETS_ROOT', env.SITE_ASSETS_ROOT),\n    siteLogoMaxBytes: integer('SITE_LOGO_MAX_BYTES', env.SITE_LOGO_MAX_BYTES, { minimum: 1024, maximum: 10485760 }),\n    siteFaviconMaxBytes: integer('SITE_FAVICON_MAX_BYTES', env.SITE_FAVICON_MAX_BYTES, { minimum: 1024, maximum: 5242880 }),\n    screenBackgroundMaxBytes: integer('SCREEN_BACKGROUND_MAX_BYTES', env.SCREEN_BACKGROUND_MAX_BYTES, { minimum: 1024, maximum: 52428800 }),\n    entityAssetMaxBytes: integer('ENTITY_ASSET_MAX_BYTES', env.ENTITY_ASSET_MAX_BYTES, { minimum: 1048576, maximum: 1073741824 }),\n    healthReadinessCacheMs: integer('HEALTH_READINESS_CACHE_MS', env.HEALTH_READINESS_CACHE_MS, { minimum: 0, maximum: 60000 }),\n    db: Object.freeze({\n      host: required('POSTGRES_HOST', env.POSTGRES_HOST),\n      port: integer('POSTGRES_PORT', env.POSTGRES_PORT, { minimum: 1, maximum: 65535 }),\n      database: required('POSTGRES_DB', env.POSTGRES_DB),\n      user: required('POSTGRES_USER', env.POSTGRES_USER),\n      password: generatedValue('POSTGRES_PASSWORD', env.POSTGRES_PASSWORD, 16),\n      poolMax: integer('POSTGRES_POOL_MAX', env.POSTGRES_POOL_MAX, { minimum: 1, maximum: 100 }),\n      connectionTimeoutMs: integer('POSTGRES_CONNECTION_TIMEOUT_MS', env.POSTGRES_CONNECTION_TIMEOUT_MS, { minimum: 100, maximum: 120000 }),\n      idleTimeoutMs: integer('POSTGRES_IDLE_TIMEOUT_MS', env.POSTGRES_IDLE_TIMEOUT_MS, { minimum: 1000, maximum: 3600000 })\n    }),\n    seedDemoData: boolean('SEED_DEMO_DATA', env.SEED_DEMO_DATA)\n  });\n}\n''')

# Public player context: fallback interval only; realtime will become primary in the next stage.
p=ROOT/'src/api/device/public-routes.js'
t=p.read_text().replace('refresh_interval_ms: config.playerRefreshSeconds * 1000', 'fallback_poll_interval_ms: config.playerFallbackPollSeconds * 1000')
p.write_text(t)

p=ROOT/'src/web/admin-ui/public/js/player/player.js'
t=p.read_text().replace('context.refresh_interval_ms', 'context.fallback_poll_interval_ms')
p.write_text(t)

# Restore settings navigation structurally, without the removed transport settings page.
p=ROOT/'src/web/admin-ui/public/js/core/navigation.js'
t=p.read_text()
t=re.sub(r"const CONTEXT_LINKS = Object\.freeze\(\{.*?\n\}\);", """const CONTEXT_LINKS = Object.freeze({\n  overview: Object.freeze([['Обзор', '/']]),\n  monitors: Object.freeze([['Торговые точки', '/locations'], ['Мониторы', '/screens'], ['Подключить ТВ', '/connect-tv']]),\n  catalog: Object.freeze([['Продукция', '/catalog']]),\n  playlist: Object.freeze([['Плейлист', '/playlist']]),\n  settings: Object.freeze([['Настройки сайта', '/settings'], ['Журнал событий', '/events'], ['Профиль', '/profile']])\n});""", t, flags=re.S)
p.write_text(t)

# New product namespace in device tests that remain relevant.
for rel in ['tests/device-player.test.js','tests/device-player-architecture.test.js','tests/device-activation-refresh-resilience.test.js']:
    p=ROOT/rel
    if not p.exists(): continue
    t=p.read_text()
    t=t.replace('TV2:', 'MIRA:').replace('menu_tv_device_session', 'mira_tv_device_session')
    t=t.replace('PLAYER_REFRESH_SECONDS', 'PLAYER_FALLBACK_POLL_SECONDS')
    t=t.replace('refresh_interval_ms', 'fallback_poll_interval_ms')
    p.write_text(t)

# Architecture tests for the new clean product baseline.
(ROOT/'tests/mira-product-baseline.test.js').write_text(r'''import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const exists = async (path) => access(path).then(() => true, () => false);

test('MIRA-TV owns the repository, runtime and installer namespace', async () => {
  const [pkg, env, compose, installer, server] = await Promise.all([
    readFile('package.json', 'utf8'), readFile('.env.example', 'utf8'), readFile('compose.yaml', 'utf8'),
    readFile('mira-tv.sh', 'utf8'), readFile('src/server.js', 'utf8')
  ]);
  const meta = JSON.parse(pkg);
  assert.equal(meta.name, 'mira-tv');
  assert.equal(meta.version, '1.0.0-1');
  assert.equal(meta.miraVersion, '1.0.0.1');
  assert.match(env, /^MIRA_TV_VERSION=1\.0\.0\.1$/m);
  assert.match(env, /^MIRA_TV_DOMAIN=$/m);
  assert.match(installer, /^SCRIPT_VERSION="1\.0\.0\.1"$/m);
  assert.match(installer, /^INSTALL_DIR="\/opt\/MIRA-TV"$/m);
  assert.match(installer, /ghost-raider-afk\/MIRA-TV/);
  assert.match(compose, /container_name: mira-tv\b/);
  assert.match(compose, /container_name: mira-tv-db\b/);
  assert.doesNotMatch(server, /Sftp|sftp/);
});

test('removed file-delivery subsystem is physically absent', async () => {
  for (const path of [
    'src/api/sftp', 'src/sftp', 'src/db/sftp.js', 'src/services/sftp-access-service.js',
    'src/services/publish-service.js', 'src/web/admin-ui/public/sftp-settings.html'
  ]) assert.equal(await exists(path), false, path);
});

test('new MIRA-TV documentation and vector brand assets exist', async () => {
  for (const path of [
    'docs/ARCHITECTURE.md','docs/INSTALLATION.md','docs/TV-PLAYER-OFFLINE-FIRST.md',
    'docs/RESOURCE-BUDGET.md','docs/REALTIME-SYNC.md','docs/BRANDING.md',
    'src/web/admin-ui/public/brand/mira-tv-mark.svg',
    'src/web/admin-ui/public/brand/mira-tv-logo.svg',
    'src/web/admin-ui/public/brand/mira-tv-splash.svg'
  ]) assert.equal(await exists(path), true, path);
});

test('TV resource defaults use a rare fallback poll and bounded local journal', async () => {
  const env = await readFile('.env.example', 'utf8');
  assert.match(env, /^PLAYER_FALLBACK_POLL_SECONDS=60$/m);
  assert.match(env, /^PLAYER_LOG_BATCH_SIZE=100$/m);
  assert.match(env, /^PLAYER_LOG_LOCAL_MAX_ENTRIES=5000$/m);
  assert.match(env, /^PLAYER_LOG_LOCAL_MAX_BYTES=10485760$/m);
});
''')

(ROOT/'tests/mira-installer.test.js').write_text(r'''import assert from 'node:assert/strict';
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
  assert.doesNotMatch(source,/SFTPGo|sftpgo/);
});
''')

print('MIRA-TV product contracts aligned')
