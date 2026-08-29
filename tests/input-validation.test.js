import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config/index.js';
import { positiveId, siteSettingsInput } from '../src/contracts/input.js';
import { menuSettingsInput } from '../src/contracts/menu-settings.js';
import { passwordChangeInput } from '../src/services/password-service.js';

function config() {
  return { passwordMinLength: 10, passwordMaxLength: 32, dashboardRefreshMinSeconds: 15, dashboardRefreshMaxSeconds: 300, screenMaxWidth: 1920, screenMaxHeight: 1080 };
}

function runtimeEnv(overrides = {}) {
  return {
    APP_NAME: 'ТВ МЕНЮ', NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '8080', MENU_TV_2_DOMAIN: 'menu.example.test',
    SESSION_SECRET: 's'.repeat(48), SESSION_TTL_HOURS: '12', SECURE_COOKIES: 'false',
    DEVICE_ACTIVATION_TTL_MINUTES: '10', DEVICE_ACTIVATION_POLL_SECONDS: '2', DEVICE_ACTIVATION_MAX_ATTEMPTS: '20',
    DEVICE_ACTIVATION_WINDOW_MINUTES: '10', DEVICE_ACTIVATION_LIMITER_MAX_ENTRIES: '10000', DEVICE_ACTIVATION_CLEANUP_MINUTES: '15', DEVICE_ACTIVATION_RETENTION_HOURS: '24',
    DEVICE_SESSION_TTL_DAYS: '365', DEVICE_HEARTBEAT_WRITE_SECONDS: '30', PLAYER_REFRESH_SECONDS: '5',
    EVENT_JOURNAL_RETENTION_DAYS: '30', EVENT_JOURNAL_MAX_ENTRIES: '5000',
    PASSWORD_MIN_LENGTH: '10', PASSWORD_MAX_LENGTH: '32', GENERATED_PASSWORD_LENGTH: '10',
    LOGIN_MAX_ATTEMPTS: '8', LOGIN_IP_MAX_ATTEMPTS: '32', LOGIN_WINDOW_MINUTES: '15', LOGIN_LIMITER_MAX_ENTRIES: '500', JSON_BODY_MAX_BYTES: '65536', MENU_DRAFT_MAX_BYTES: '49152', SCREEN_SOURCE_MAX_BYTES: '12582912',
    DASHBOARD_REFRESH_MIN_SECONDS: '15', DASHBOARD_REFRESH_MAX_SECONDS: '300', SCREEN_MAX_WIDTH: '1920', SCREEN_MAX_HEIGHT: '1080', IMAGE_MAX_PIXELS: '40000000',
    SITE_ASSETS_ROOT: '/tmp/menu-tv-assets', SITE_LOGO_MAX_BYTES: '2097152', SITE_FAVICON_MAX_BYTES: '524288', SCREEN_BACKGROUND_MAX_BYTES: '20971520', ENTITY_ASSET_MAX_BYTES: '104857600', HEALTH_READINESS_CACHE_MS: '2000',
    POSTGRES_HOST: 'db', POSTGRES_PORT: '5432', POSTGRES_DB: 'menu_tv_2', POSTGRES_USER: 'menu_tv_2', POSTGRES_PASSWORD: 'p'.repeat(32), POSTGRES_POOL_MAX: '5', POSTGRES_CONNECTION_TIMEOUT_MS: '5000', POSTGRES_IDLE_TIMEOUT_MS: '30000',
    SFTP_PUBLIC_HOST: 'menu.example.test', SFTP_PORT: '2022', SFTP_API_URL: 'http://sftp:8080', SFTP_API_TIMEOUT_MS: '5000', SFTP_STORAGE_ROOT: '/srv/menu-tv-sftp', SFTP_STAGING_MAX_AGE_HOURS: '24', SFTP_ADMIN_USERNAME: 'menu_tv_2_service', SFTP_ADMIN_PASSWORD: 'a'.repeat(40), SEED_DEMO_DATA: 'false',
    ...overrides
  };
}

test('positive ids reject trailing characters and unsafe integers', () => {
  assert.equal(positiveId('42', 'id'), 42);
  assert.equal(positiveId(42, 'id'), 42);
  assert.throws(() => positiveId('42abc', 'id'), /положительным целым/);
  assert.throws(() => positiveId('1.5', 'id'), /положительным целым/);
  assert.throws(() => positiveId('9007199254740993', 'id'), /положительным целым/);
});

test('site settings validate refresh interval and seven login logo sizes', () => {
  const base = { application_name: 'ТВ МЕНЮ', accent_color: '#F4C915', timezone: 'Europe/Moscow', date_format: 'DD.MM.YYYY', default_screen_resolution: '1920×1080', signin_logo_size: 1 };
  assert.equal(siteSettingsInput({ ...base, dashboard_refresh_seconds: '30' }, config()).dashboard_refresh_seconds, 30);
  assert.equal(siteSettingsInput({ ...base, dashboard_refresh_seconds: '30', signin_logo_size: 7 }, config()).signin_logo_size, 7);
  assert.throws(() => siteSettingsInput({ ...base, dashboard_refresh_seconds: '30seconds' }, config()), /Интервал обновления/);
  assert.throws(() => siteSettingsInput({ ...base, dashboard_refresh_seconds: 30, signin_logo_size: 8 }, config()), /размер логотипа/i);
});

test('table font uses a closed allowlist and includes Tahoma Bold', () => {
  assert.equal(menuSettingsInput({ font_family: 'tahoma-bold' }).font_family, 'tahoma-bold');
  assert.equal(menuSettingsInput({}).font_family, 'arial-narrow');
  assert.throws(() => menuSettingsInput({ font_family: 'Comic Sans MS' }).font_family, /Шрифт таблицы/);
});

test('current password is verified as entered while complexity applies only to the new password', () => {
  const result = passwordChangeInput({ current_password: 'legacy', new_password: 'New-Password1!' }, config());
  assert.equal(result.currentPassword, 'legacy');
  assert.throws(() => passwordChangeInput({ current_password: 'legacy', new_password: 'weakpassword' }, config()), /строчную и прописную/);
});

test('environment integer parser rejects partial numeric strings', () => {
  assert.throws(() => loadConfig(runtimeEnv({ SFTP_API_TIMEOUT_MS: '5000ms' })), /SFTP_API_TIMEOUT_MS.*целым числом/);
  assert.throws(() => loadConfig(runtimeEnv({ POSTGRES_POOL_MAX: '5connections' })), /POSTGRES_POOL_MAX.*целым числом/);
  assert.throws(() => loadConfig(runtimeEnv({ SCREEN_BACKGROUND_MAX_BYTES: '20MB' })), /SCREEN_BACKGROUND_MAX_BYTES.*целым числом/);
  assert.throws(() => loadConfig(runtimeEnv({ ENTITY_ASSET_MAX_BYTES: '100MB' })), /ENTITY_ASSET_MAX_BYTES.*целым числом/);
});
