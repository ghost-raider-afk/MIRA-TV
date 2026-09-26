import { createDatabasePool } from './pool.js';
import { initialiseSchema } from './migrations/schema.js';
import { migrateLegacyMenuSettings } from './migrations/menu-settings.js';
import { retireLegacyTemplates } from './migrations/template-retirement.js';
import { migrateScreenNumbering } from './migrations/screen-numbering.js';
import { migrateAnimationSettings } from './migrations/animation-settings.js';
import { migrateDevicePlayer } from './migrations/device-player.js';
import { migrateFrontendErrorJournal } from './migrations/frontend-error-journal.js';
import { migrateEventJournal } from './migrations/event-journal.js';
import { migrateSceneEntity } from './migrations/scene-entity.js';
import { migrateAnnouncementTicker } from './migrations/announcement-ticker.js';
import { migrateDeviceBindings } from './migrations/device-bindings.js';
import { migrateMotionProfileV3 } from './migrations/motion-profile-v3.js';
import { migrateAnimationOverlays } from './migrations/animation-overlays.js';
import { migrateScreenAnimationSettings } from './migrations/screen-animation-settings.js';
import { migrateEnvironmentLayer } from './migrations/environment-layer.js';
import { migrateScenePlaylist } from './migrations/scene-playlist.js';
import { migratePlayerTelemetry } from './migrations/player-telemetry.js';
import { migratePlayerMetrics } from './migrations/player-metrics.js';
import { migrateDeviceIdentification } from './migrations/device-identification.js';
import { migrateWeatherSnapshots } from './migrations/weather-snapshots.js';
import { migrateSiteUiScale } from './migrations/site-ui-scale.js';
import { migratePlayerCacheStatus } from './migrations/player-cache-status.js';
import { migrateScreenRenderJournal } from './migrations/screen-render-journal.js';
import { migrateWeatherWidget } from './migrations/weather-widget.js';
import { migrateManagerRole } from './migrations/manager-role.js';
import { migrateSceneElementsStorage } from './migrations/scene-elements.js';
import { migrateLegacySceneOwnership } from './migrations/scene-element-ownership.js';
import { retireLegacySceneOwnership } from './migrations/scene-ownership-cleanup.js';
import { removeLegacySceneElements } from './migrations/scene-legacy-elements-cleanup.js';
import { runMigrations } from './migrations/runner.js';
import { seedDemoData } from './migrations/seed.js';
import { createOverviewRepository } from './overview.js';
import { createUsersRepository } from './users.js';
import { createSettingsRepository } from './settings.js';
import { createNotificationsRepository } from './notifications.js';
import { createLocationsRepository } from './locations.js';
import { createScreensRepository } from './screens.js';
import { createCatalogRepository } from './catalog.js';
import { createCatalogUsageRepository } from './catalog-usage.js';
import { createDevicesRepository } from './devices.js';
import { createPlayerTelemetryRepository } from './player-telemetry.js';
import { createPlayerMetricsRepository } from './player-metrics.js';
import { createScreenRenderJournalRepository } from './screen-render-journal.js';
import { createWeatherRepository } from './weather.js';
import { createPlayerCacheStatusRepository } from './player-cache-status.js';

const MIGRATIONS = Object.freeze([
  { name: '001-schema', run: initialiseSchema },
  { name: '002-legacy-menu-settings', run: migrateLegacyMenuSettings },
  { name: '003-retire-legacy-templates', run: retireLegacyTemplates },
  { name: '004-screen-numbering', run: migrateScreenNumbering },
  { name: '005-animation-settings', run: migrateAnimationSettings },
  { name: '006-device-player', run: migrateDevicePlayer },
  { name: '007-frontend-error-journal', run: migrateFrontendErrorJournal },
  { name: '008-event-journal', run: migrateEventJournal },
  { name: '009-scene-entity', run: migrateSceneEntity },
  { name: '010-announcement-ticker', run: migrateAnnouncementTicker },
  { name: '011-device-bindings', run: migrateDeviceBindings },
  { name: '012-motion-profile-v3', run: migrateMotionProfileV3 },
  { name: '013-animation-overlays', run: migrateAnimationOverlays },
  { name: '014-screen-animation-settings', run: migrateScreenAnimationSettings },
  { name: '015-environment-layer', run: migrateEnvironmentLayer },
  { name: '016-scene-playlist', run: migrateScenePlaylist },
  { name: '017-player-telemetry', run: migratePlayerTelemetry },
  { name: '018-screen-render-journal', run: migrateScreenRenderJournal },
  { name: '019-weather-widget', run: migrateWeatherWidget },
  { name: '020-manager-role', run: migrateManagerRole },
  { name: '021-scene-elements', run: migrateSceneElementsStorage },
  { name: '022-scene-element-ownership', run: migrateLegacySceneOwnership },
  { name: '023-scene-ownership-cleanup', run: retireLegacySceneOwnership },
  { name: '024-scene-legacy-elements-cleanup', run: removeLegacySceneElements },
  { name: '025-player-metrics', run: migratePlayerMetrics },
  { name: '026-device-identification', run: migrateDeviceIdentification },
  { name: '027-weather-snapshots', run: migrateWeatherSnapshots },
  { name: '028-site-ui-scale', run: migrateSiteUiScale },
  { name: '029-player-cache-status', run: migratePlayerCacheStatus }
]);

function createRepositories(queryable) {
  const locations = createLocationsRepository(queryable);
  return Object.assign(
    {},
    createOverviewRepository(queryable),
    createUsersRepository(queryable),
    createSettingsRepository(queryable),
    createNotificationsRepository(queryable),
    locations,
    createScreensRepository(queryable),
    createCatalogRepository(queryable),
    createCatalogUsageRepository(queryable),
    createDevicesRepository(queryable),
    createPlayerTelemetryRepository(queryable),
    createPlayerMetricsRepository(queryable),
    createScreenRenderJournalRepository(queryable),
    createWeatherRepository(queryable),
    createPlayerCacheStatusRepository(queryable)
  );
}

export class MiraTvStore {
  constructor(dbConfig, { seedDemoData: enableDemoSeed = false, pool = null } = {}) {
    this.pool = pool ?? createDatabasePool(dbConfig);
    this.seedDemoData = enableDemoSeed;
    Object.assign(this, createRepositories(this.pool));
  }

  async init() {
    await runMigrations(this.pool, MIGRATIONS);
    if (this.seedDemoData) await seedDemoData(this.pool);
  }

  async transaction(run) {
    if (typeof run !== 'function') throw new TypeError('Транзакция требует функцию выполнения.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await run(createRepositories(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}
