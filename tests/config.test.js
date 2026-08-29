import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config/index.js';
import { generateSftpPassword } from '../src/sftp/index.js';

function validEnv(overrides = {}) {
  return {
    APP_NAME: 'ТВ МЕНЮ', NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '8080', MENU_TV_2_DOMAIN: 'menu.example.test',
    SESSION_SECRET: 's'.repeat(48), SESSION_TTL_HOURS: '12', SECURE_COOKIES: 'false',
    DEVICE_ACTIVATION_TTL_MINUTES: '10', DEVICE_ACTIVATION_POLL_SECONDS: '2', DEVICE_ACTIVATION_MAX_ATTEMPTS: '20',
    DEVICE_ACTIVATION_WINDOW_MINUTES: '10', DEVICE_ACTIVATION_LIMITER_MAX_ENTRIES: '10000', DEVICE_ACTIVATION_CLEANUP_MINUTES: '15',
    DEVICE_ACTIVATION_RETENTION_HOURS: '24', DEVICE_SESSION_TTL_DAYS: '365', DEVICE_HEARTBEAT_WRITE_SECONDS: '30', PLAYER_REFRESH_SECONDS: '5',
    EVENT_JOURNAL_RETENTION_DAYS: '30', EVENT_JOURNAL_MAX_ENTRIES: '5000',
    PASSWORD_MIN_LENGTH: '10', PASSWORD_MAX_LENGTH: '32', GENERATED_PASSWORD_LENGTH: '10',
    LOGIN_MAX_ATTEMPTS: '8', LOGIN_IP_MAX_ATTEMPTS: '32', LOGIN_WINDOW_MINUTES: '15', LOGIN_LIMITER_MAX_ENTRIES: '500',
    JSON_BODY_MAX_BYTES: '65536', MENU_DRAFT_MAX_BYTES: '49152', SCREEN_SOURCE_MAX_BYTES: '12582912',
    DASHBOARD_REFRESH_MIN_SECONDS: '15', DASHBOARD_REFRESH_MAX_SECONDS: '300', SCREEN_MAX_WIDTH: '1920', SCREEN_MAX_HEIGHT: '1080', IMAGE_MAX_PIXELS: '40000000',
    SITE_ASSETS_ROOT: '/tmp/menu-tv-site-assets', SITE_LOGO_MAX_BYTES: '2097152', SITE_FAVICON_MAX_BYTES: '524288', SCREEN_BACKGROUND_MAX_BYTES: '20971520', ENTITY_ASSET_MAX_BYTES: '104857600',
    HEALTH_READINESS_CACHE_MS: '2000', POSTGRES_HOST: 'db', POSTGRES_PORT: '5432', POSTGRES_DB: 'menu_tv_2', POSTGRES_USER: 'menu_tv_2',
    POSTGRES_PASSWORD: 'p'.repeat(32), POSTGRES_POOL_MAX: '5', POSTGRES_CONNECTION_TIMEOUT_MS: '5000', POSTGRES_IDLE_TIMEOUT_MS: '30000',
    SFTP_PUBLIC_HOST: 'menu.example.test', SFTP_PORT: '2022', SFTP_API_URL: 'http://sftp:8080', SFTP_API_TIMEOUT_MS: '5000',
    SFTP_STORAGE_ROOT: '/srv/menu-tv-sftp', SFTP_STAGING_MAX_AGE_HOURS: '24', SFTP_ADMIN_USERNAME: 'menu_tv_2_service', SFTP_ADMIN_PASSWORD: 'a'.repeat(40),
    SEED_DEMO_DATA: 'false', ...overrides
  };
}

test('runtime limits are controlled only by environment values', () => {
  const config = loadConfig(validEnv({
    JSON_BODY_MAX_BYTES: '70000', MENU_DRAFT_MAX_BYTES: '50000', SCREEN_SOURCE_MAX_BYTES: '13000000', SCREEN_BACKGROUND_MAX_BYTES: '20000000', ENTITY_ASSET_MAX_BYTES: '150000000',
    DASHBOARD_REFRESH_MIN_SECONDS: '20', DASHBOARD_REFRESH_MAX_SECONDS: '240', SCREEN_MAX_WIDTH: '1600', SCREEN_MAX_HEIGHT: '900', IMAGE_MAX_PIXELS: '12000000',
    LOGIN_MAX_ATTEMPTS: '6', LOGIN_IP_MAX_ATTEMPTS: '24', LOGIN_WINDOW_MINUTES: '10', LOGIN_LIMITER_MAX_ENTRIES: '700', GENERATED_PASSWORD_LENGTH: '18',
    DEVICE_ACTIVATION_TTL_MINUTES: '8', DEVICE_ACTIVATION_POLL_SECONDS: '3', DEVICE_ACTIVATION_MAX_ATTEMPTS: '12',
    DEVICE_ACTIVATION_WINDOW_MINUTES: '7', DEVICE_ACTIVATION_LIMITER_MAX_ENTRIES: '5000', DEVICE_ACTIVATION_CLEANUP_MINUTES: '9',
    DEVICE_ACTIVATION_RETENTION_HOURS: '18', DEVICE_SESSION_TTL_DAYS: '540', DEVICE_HEARTBEAT_WRITE_SECONDS: '45', PLAYER_REFRESH_SECONDS: '7',
    EVENT_JOURNAL_RETENTION_DAYS: '21', EVENT_JOURNAL_MAX_ENTRIES: '3500',
    SFTP_API_TIMEOUT_MS: '4200', SFTP_STAGING_MAX_AGE_HOURS: '36', POSTGRES_POOL_MAX: '9', POSTGRES_CONNECTION_TIMEOUT_MS: '4100',
    POSTGRES_IDLE_TIMEOUT_MS: '28000', HEALTH_READINESS_CACHE_MS: '1500'
  }));
  assert.equal(config.jsonBodyMaxBytes, 70000);
  assert.equal(config.menuDraftMaxBytes, 50000);
  assert.equal(config.screenSourceMaxBytes, 13000000);
  assert.equal(config.screenBackgroundMaxBytes, 20000000);
  assert.equal(config.entityAssetMaxBytes, 150000000);
  assert.equal(config.dashboardRefreshMinSeconds, 20);
  assert.equal(config.dashboardRefreshMaxSeconds, 240);
  assert.equal(config.screenMaxWidth, 1600);
  assert.equal(config.screenMaxHeight, 900);
  assert.equal(config.imageMaxPixels, 12000000);
  assert.equal(config.loginMaxAttempts, 6);
  assert.equal(config.loginIpMaxAttempts, 24);
  assert.equal(config.loginWindowMinutes, 10);
  assert.equal(config.loginLimiterMaxEntries, 700);
  assert.equal(config.generatedPasswordLength, 18);
  assert.equal(config.deviceActivationTtlMinutes, 8);
  assert.equal(config.deviceActivationPollSeconds, 3);
  assert.equal(config.deviceActivationMaxAttempts, 12);
  assert.equal(config.deviceActivationWindowMinutes, 7);
  assert.equal(config.deviceActivationLimiterMaxEntries, 5000);
  assert.equal(config.deviceActivationCleanupMinutes, 9);
  assert.equal(config.deviceActivationRetentionHours, 18);
  assert.equal(config.deviceSessionTtlDays, 540);
  assert.equal(config.deviceHeartbeatWriteSeconds, 45);
  assert.equal(config.playerRefreshSeconds, 7);
  assert.equal(config.eventJournalRetentionDays, 21);
  assert.equal(config.eventJournalMaxEntries, 3500);
  assert.equal(config.sftp.apiTimeoutMs, 4200);
  assert.equal(config.sftp.stagingMaxAgeHours, 36);
  assert.equal(config.db.poolMax, 9);
  assert.equal(config.db.connectionTimeoutMs, 4100);
  assert.equal(config.db.idleTimeoutMs, 28000);
  assert.equal(config.healthReadinessCacheMs, 1500);
  assert.equal(Object.hasOwn(config, 'templateBackgroundMaxBytes'), false);
  assert.equal(Object.hasOwn(config, 'frontendErrorRetentionDays'), false);
});

test('every declared application runtime env value is mandatory and has no code fallback', () => {
  const baseline = validEnv();
  for (const key of Object.keys(baseline)) {
    const env = { ...baseline };
    delete env[key];
    assert.throws(() => loadConfig(env), new RegExp(key), key);
  }
});

test('legacy frontend error env values are not runtime sources', () => {
  const env = validEnv();
  delete env.EVENT_JOURNAL_RETENTION_DAYS;
  delete env.EVENT_JOURNAL_MAX_ENTRIES;
  env.FRONTEND_ERROR_RETENTION_DAYS = '14';
  env.FRONTEND_ERROR_MAX_ENTRIES = '2000';
  assert.throws(() => loadConfig(env), /EVENT_JOURNAL_RETENTION_DAYS|EVENT_JOURNAL_MAX_ENTRIES/);
});

test('legacy template background env is not a runtime source', () => {
  const env = validEnv();
  delete env.SCREEN_BACKGROUND_MAX_BYTES;
  env.TEMPLATE_BACKGROUND_MAX_BYTES = '20971520';
  assert.throws(() => loadConfig(env), /SCREEN_BACKGROUND_MAX_BYTES/);
});

test('runtime booleans must be explicit true or false', () => {
  assert.throws(() => loadConfig(validEnv({ SECURE_COOKIES: 'yes' })), /SECURE_COOKIES/);
  assert.equal(loadConfig(validEnv({ SECURE_COOKIES: 'true' })).secureCookies, true);
});

test('generated SFTP password respects configured length and character classes', () => {
  const password = generateSftpPassword(18);
  assert.equal(password.length, 18);
  assert.match(password, /[A-Z]/);
  assert.match(password, /[a-z]/);
  assert.match(password, /\d/);
});
