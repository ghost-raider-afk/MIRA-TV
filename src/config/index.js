import { boolean, bootstrapAdministrator, generatedValue, integer, required } from './env.js';

export function loadConfig(env = process.env) {
  const passwordMinLength = integer('PASSWORD_MIN_LENGTH', env.PASSWORD_MIN_LENGTH, { minimum: 10, maximum: 64 });
  const passwordMaxLength = integer('PASSWORD_MAX_LENGTH', env.PASSWORD_MAX_LENGTH, { minimum: passwordMinLength, maximum: 128 });
  const dashboardRefreshMinSeconds = integer('DASHBOARD_REFRESH_MIN_SECONDS', env.DASHBOARD_REFRESH_MIN_SECONDS, { minimum: 5, maximum: 3600 });
  const dashboardRefreshMaxSeconds = integer('DASHBOARD_REFRESH_MAX_SECONDS', env.DASHBOARD_REFRESH_MAX_SECONDS, { minimum: dashboardRefreshMinSeconds, maximum: 86400 });

  return Object.freeze({
    appName: required('APP_NAME', env.APP_NAME),
    nodeEnv: required('NODE_ENV', env.NODE_ENV),
    host: required('HOST', env.HOST),
    port: integer('PORT', env.PORT, { minimum: 1, maximum: 65535 }),
    domain: required('MENU_TV_2_DOMAIN', env.MENU_TV_2_DOMAIN),
    bootstrapAdmin: bootstrapAdministrator(env, passwordMinLength),
    sessionSecret: generatedValue('SESSION_SECRET', env.SESSION_SECRET, 32),
    sessionTtlHours: integer('SESSION_TTL_HOURS', env.SESSION_TTL_HOURS, { minimum: 1, maximum: 168 }),
    secureCookies: boolean('SECURE_COOKIES', env.SECURE_COOKIES),
    deviceActivationTtlMinutes: integer('DEVICE_ACTIVATION_TTL_MINUTES', env.DEVICE_ACTIVATION_TTL_MINUTES, { minimum: 1, maximum: 60 }),
    deviceActivationPollSeconds: integer('DEVICE_ACTIVATION_POLL_SECONDS', env.DEVICE_ACTIVATION_POLL_SECONDS, { minimum: 1, maximum: 15 }),
    deviceActivationMaxAttempts: integer('DEVICE_ACTIVATION_MAX_ATTEMPTS', env.DEVICE_ACTIVATION_MAX_ATTEMPTS, { minimum: 1, maximum: 1000 }),
    deviceActivationWindowMinutes: integer('DEVICE_ACTIVATION_WINDOW_MINUTES', env.DEVICE_ACTIVATION_WINDOW_MINUTES, { minimum: 1, maximum: 1440 }),
    deviceActivationLimiterMaxEntries: integer('DEVICE_ACTIVATION_LIMITER_MAX_ENTRIES', env.DEVICE_ACTIVATION_LIMITER_MAX_ENTRIES, { minimum: 10, maximum: 100000 }),
    deviceActivationCleanupMinutes: integer('DEVICE_ACTIVATION_CLEANUP_MINUTES', env.DEVICE_ACTIVATION_CLEANUP_MINUTES, { minimum: 1, maximum: 1440 }),
    deviceActivationRetentionHours: integer('DEVICE_ACTIVATION_RETENTION_HOURS', env.DEVICE_ACTIVATION_RETENTION_HOURS, { minimum: 1, maximum: 720 }),
    deviceSessionTtlDays: integer('DEVICE_SESSION_TTL_DAYS', env.DEVICE_SESSION_TTL_DAYS, { minimum: 1, maximum: 3650 }),
    deviceHeartbeatWriteSeconds: integer('DEVICE_HEARTBEAT_WRITE_SECONDS', env.DEVICE_HEARTBEAT_WRITE_SECONDS, { minimum: 5, maximum: 600 }),
    playerRefreshSeconds: integer('PLAYER_REFRESH_SECONDS', env.PLAYER_REFRESH_SECONDS, { minimum: 2, maximum: 300 }),
    eventJournalRetentionDays: integer('EVENT_JOURNAL_RETENTION_DAYS', env.EVENT_JOURNAL_RETENTION_DAYS, { minimum: 1, maximum: 365 }),
    eventJournalMaxEntries: integer('EVENT_JOURNAL_MAX_ENTRIES', env.EVENT_JOURNAL_MAX_ENTRIES, { minimum: 100, maximum: 100000 }),
    passwordMinLength,
    passwordMaxLength,
    generatedPasswordLength: integer('GENERATED_PASSWORD_LENGTH', env.GENERATED_PASSWORD_LENGTH, { minimum: 10, maximum: 64 }),
    loginMaxAttempts: integer('LOGIN_MAX_ATTEMPTS', env.LOGIN_MAX_ATTEMPTS, { minimum: 1, maximum: 100 }),
    loginIpMaxAttempts: integer('LOGIN_IP_MAX_ATTEMPTS', env.LOGIN_IP_MAX_ATTEMPTS, { minimum: 1, maximum: 1000 }),
    loginWindowMinutes: integer('LOGIN_WINDOW_MINUTES', env.LOGIN_WINDOW_MINUTES, { minimum: 1, maximum: 1440 }),
    loginLimiterMaxEntries: integer('LOGIN_LIMITER_MAX_ENTRIES', env.LOGIN_LIMITER_MAX_ENTRIES, { minimum: 10, maximum: 100000 }),
    jsonBodyMaxBytes: integer('JSON_BODY_MAX_BYTES', env.JSON_BODY_MAX_BYTES, { minimum: 1024, maximum: 10485760 }),
    menuDraftMaxBytes: integer('MENU_DRAFT_MAX_BYTES', env.MENU_DRAFT_MAX_BYTES, { minimum: 1024, maximum: 10485760 }),
    screenSourceMaxBytes: integer('SCREEN_SOURCE_MAX_BYTES', env.SCREEN_SOURCE_MAX_BYTES, { minimum: 1024, maximum: 52428800 }),
    dashboardRefreshMinSeconds,
    dashboardRefreshMaxSeconds,
    screenMaxWidth: integer('SCREEN_MAX_WIDTH', env.SCREEN_MAX_WIDTH, { minimum: 320, maximum: 7680 }),
    screenMaxHeight: integer('SCREEN_MAX_HEIGHT', env.SCREEN_MAX_HEIGHT, { minimum: 240, maximum: 4320 }),
    imageMaxPixels: integer('IMAGE_MAX_PIXELS', env.IMAGE_MAX_PIXELS, { minimum: 262144, maximum: 100000000 }),
    siteAssetsRoot: required('SITE_ASSETS_ROOT', env.SITE_ASSETS_ROOT),
    siteLogoMaxBytes: integer('SITE_LOGO_MAX_BYTES', env.SITE_LOGO_MAX_BYTES, { minimum: 1024, maximum: 10485760 }),
    siteFaviconMaxBytes: integer('SITE_FAVICON_MAX_BYTES', env.SITE_FAVICON_MAX_BYTES, { minimum: 1024, maximum: 5242880 }),
    screenBackgroundMaxBytes: integer('SCREEN_BACKGROUND_MAX_BYTES', env.SCREEN_BACKGROUND_MAX_BYTES, { minimum: 1024, maximum: 52428800 }),
    entityAssetMaxBytes: integer('ENTITY_ASSET_MAX_BYTES', env.ENTITY_ASSET_MAX_BYTES, { minimum: 1048576, maximum: 1073741824 }),
    healthReadinessCacheMs: integer('HEALTH_READINESS_CACHE_MS', env.HEALTH_READINESS_CACHE_MS, { minimum: 0, maximum: 60000 }),
    db: Object.freeze({
      host: required('POSTGRES_HOST', env.POSTGRES_HOST),
      port: integer('POSTGRES_PORT', env.POSTGRES_PORT, { minimum: 1, maximum: 65535 }),
      database: required('POSTGRES_DB', env.POSTGRES_DB),
      user: required('POSTGRES_USER', env.POSTGRES_USER),
      password: generatedValue('POSTGRES_PASSWORD', env.POSTGRES_PASSWORD, 16),
      poolMax: integer('POSTGRES_POOL_MAX', env.POSTGRES_POOL_MAX, { minimum: 1, maximum: 100 }),
      connectionTimeoutMs: integer('POSTGRES_CONNECTION_TIMEOUT_MS', env.POSTGRES_CONNECTION_TIMEOUT_MS, { minimum: 100, maximum: 120000 }),
      idleTimeoutMs: integer('POSTGRES_IDLE_TIMEOUT_MS', env.POSTGRES_IDLE_TIMEOUT_MS, { minimum: 1000, maximum: 3600000 })
    }),
    sftp: Object.freeze({
      apiUrl: required('SFTP_API_URL', env.SFTP_API_URL),
      apiTimeoutMs: integer('SFTP_API_TIMEOUT_MS', env.SFTP_API_TIMEOUT_MS, { minimum: 500, maximum: 60000 }),
      stagingMaxAgeHours: integer('SFTP_STAGING_MAX_AGE_HOURS', env.SFTP_STAGING_MAX_AGE_HOURS, { minimum: 1, maximum: 720 }),
      adminUsername: required('SFTP_ADMIN_USERNAME', env.SFTP_ADMIN_USERNAME),
      adminPassword: generatedValue('SFTP_ADMIN_PASSWORD', env.SFTP_ADMIN_PASSWORD, 32),
      storageRoot: required('SFTP_STORAGE_ROOT', env.SFTP_STORAGE_ROOT),
      publicHost: required('SFTP_PUBLIC_HOST', env.SFTP_PUBLIC_HOST),
      port: integer('SFTP_PORT', env.SFTP_PORT, { minimum: 1, maximum: 65535 })
    }),
    seedDemoData: boolean('SEED_DEMO_DATA', env.SEED_DEMO_DATA)
  });
}
