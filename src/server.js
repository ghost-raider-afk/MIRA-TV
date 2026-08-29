import express from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadConfig } from './config/index.js';
import { MenuTvStore } from './db/index.js';
import { logger } from './logger/index.js';
import { errorHandler } from './middleware/errors.js';
import { protectStateChangingRequest } from './middleware/request-origin.js';
import { createSessionMiddleware } from './middleware/session.js';
import { hashPassword } from './services/password-service.js';
import { createPublishService } from './services/publish-service.js';
import { createSessionResolver } from './services/session-service.js';
import { siteSettingsResponse } from './services/site-assets-service.js';
import { migrateLegacyBackgroundAssets } from './services/legacy-background-migration.js';
import { SftpService } from './sftp/index.js';
import { AUTHENTICATED_PAGES, LEGACY_PAGE_REDIRECTS, canonicalRedirectTarget } from './web/admin-ui/routes.js';
import { createAuthRouter } from './api/auth/routes.js';
import { createSessionRouter } from './api/session/routes.js';
import { createOverviewRouter } from './api/overview/routes.js';
import { createSettingsRouter } from './api/settings/routes.js';
import { createNotificationsRouter } from './api/notifications/routes.js';
import { createDiagnosticsRouter } from './api/diagnostics/routes.js';
import { createCatalogRouter } from './api/catalog/routes.js';
import { createLocationsRouter } from './api/locations/routes.js';
import { createScreensRouter } from './api/screens/routes.js';
import { createSftpRouter } from './api/sftp/routes.js';
import { createDevicePublicRouter } from './api/device/public-routes.js';
import { createDeviceAdminRouter } from './api/device/admin-routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'web', 'admin-ui', 'public');
const nodeModulesDir = path.resolve(__dirname, '..', 'node_modules');

async function initialiseStore(store, config) {
  await store.init();
  await migrateLegacyBackgroundAssets(config.siteAssetsRoot).catch((error) => {
    logger.warn('Legacy monitor backgrounds could not be migrated', { error });
  });
  const bootstrapAdmin = config.bootstrapAdmin
    ? { username: config.bootstrapAdmin.username, passwordHash: await hashPassword(config.bootstrapAdmin.password) }
    : null;
  await store.ensureInitialAdministrator(bootstrapAdmin || undefined);
  await store.setInitialSiteName(config.appName);
}

async function cleanupDeviceActivations(store, config) {
  const retentionHours = Number(config?.deviceActivationRetentionHours);
  if (typeof store?.deleteExpiredDeviceActivations !== 'function' || !Number.isFinite(retentionHours) || retentionHours < 1) return 0;
  const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000).toISOString();
  try {
    const removed = await store.deleteExpiredDeviceActivations(cutoff);
    if (removed) logger.info('Expired TV activation records removed', { removed });
    return removed;
  } catch (error) {
    logger.warn('Expired TV activation records could not be removed', { error });
    return 0;
  }
}

async function cleanupEvents(store, config) {
  if (typeof store?.pruneEvents !== 'function') return 0;
  try {
    const removed = await store.pruneEvents({
      retentionDays: config.eventJournalRetentionDays,
      maxEntries: config.eventJournalMaxEntries
    });
    if (removed) logger.info('Expired event journal entries removed', { removed });
    return removed;
  } catch (error) {
    logger.warn('Expired event journal entries could not be removed', { error });
    return 0;
  }
}

async function recoverRuntimeState(store, sftp, config) {
  await cleanupDeviceActivations(store, config);
  await cleanupEvents(store, config);
  const requiredMethods = ['publishedInfo', 'removeStaged', 'cleanupStaging'];
  if (!requiredMethods.every((method) => typeof sftp?.[method] === 'function')) return;
  const publish = createPublishService({ store, sftp, config });
  try {
    const recovery = await publish.reconcilePending();
    if (recovery.recovered || recovery.unresolved) logger.info('Publication recovery completed', recovery);
  } catch (error) {
    logger.warn('Publication recovery could not complete', { error });
  }
  try {
    const cleanup = await publish.cleanupStaging({ maxAgeMs: config.sftp.stagingMaxAgeHours * 60 * 60 * 1000 });
    if (cleanup.removed) logger.info('Unused staging JPEG files removed', cleanup);
  } catch (error) {
    logger.warn('Staging cleanup could not complete', { error });
  }
}

function configureSecurity(app, config) {
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        imgSrc: ["'self'", 'data:', 'blob:']
      }
    }
  }));
  app.use(express.json({ limit: config.jsonBodyMaxBytes }));
}

function mountPublicRoutes(app, { store, config }) {
  let readiness = { checkedAt: 0, ok: false };
  app.get('/healthz', (_request, response) => response.json({ status: 'ok', service: 'menu-tv-2.0' }));
  app.get('/readyz', async (_request, response) => {
    const now = Date.now();
    if (now - readiness.checkedAt <= config.healthReadinessCacheMs) {
      return response.status(readiness.ok ? 200 : 503).json({ status: readiness.ok ? 'ready' : 'not_ready', service: 'menu-tv-2.0' });
    }
    try {
      await store.pool.query('SELECT 1');
      readiness = { checkedAt: now, ok: true };
      return response.json({ status: 'ready', service: 'menu-tv-2.0' });
    } catch {
      readiness = { checkedAt: now, ok: false };
      return response.status(503).json({ status: 'not_ready', service: 'menu-tv-2.0' });
    }
  });
  app.use('/site-assets', express.static(config.siteAssetsRoot, { etag: true, maxAge: '1d', immutable: true }));
  app.get('/api/public/config', async (_request, response) => {
    const site = siteSettingsResponse(await store.getSiteSettings(), config);
    response.json({
      app_name: site.app_name,
      logo_url: site.logo_url,
      favicon_url: site.favicon_url,
      accent_color: site.accent_color,
      signin_logo_size: site.signin_logo_size
    });
  });
  app.use('/api/device', createDevicePublicRouter({ store, config }));
}

function mountProtectedApi(app, dependencies, requireApiSession) {
  app.use('/api', requireApiSession);
  app.use('/api', protectStateChangingRequest);
  app.use('/api', createSessionRouter(dependencies));
  app.use('/api', createOverviewRouter(dependencies));
  app.use('/api/settings', createSettingsRouter(dependencies));
  app.use('/api/notifications', createNotificationsRouter(dependencies));
  app.use('/api/diagnostics', createDiagnosticsRouter(dependencies));
  app.use('/api/catalog', createCatalogRouter(dependencies));
  app.use('/api/locations', createLocationsRouter(dependencies));
  app.use('/api/device-admin', createDeviceAdminRouter(dependencies));
  app.use('/api', createScreensRouter(dependencies));
  app.use('/api', createSftpRouter(dependencies));
}

function sendHtmlFile(response, filename) {
  response.setHeader('Cache-Control', 'no-store');
  return response.sendFile(path.join(publicDir, filename));
}

function isBrowserNavigation(request) {
  return request.get('sec-fetch-mode') === 'navigate' || request.get('sec-fetch-dest') === 'document';
}

function mountFrontend(app, requirePageSession) {
  for (const [legacy, canonical] of LEGACY_PAGE_REDIRECTS) {
    app.get(legacy, (request, response) => response.redirect(308, canonicalRedirectTarget(request, canonical)));
  }
  app.get('/player.html', (request, response, next) => {
    if (isBrowserNavigation(request)) return response.redirect(308, canonicalRedirectTarget(request, '/player'));
    return next();
  });

  app.get('/signin', (_request, response) => sendHtmlFile(response, 'signin.html'));
  app.get('/player', (_request, response) => sendHtmlFile(response, 'player.html'));

  for (const page of AUTHENTICATED_PAGES) {
    app.get(page.path, requirePageSession, (_request, response) => sendHtmlFile(response, page.file));
  }

  app.use('/vendor', express.static(path.join(nodeModulesDir, 'jsqr', 'dist'), {
    etag: true,
    maxAge: 0,
    setHeaders(response) {
      response.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }));
  app.use(express.static(publicDir, {
    index: false,
    etag: true,
    maxAge: 0,
    setHeaders(response, filename) {
      const extension = path.extname(filename).toLowerCase();
      if (extension === '.html') {
        response.setHeader('Cache-Control', 'no-store');
        return;
      }
      if (extension === '.js' || extension === '.css') {
        response.setHeader('Cache-Control', 'no-cache, must-revalidate');
        return;
      }
      response.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
  }));
}

export async function createApp(config = loadConfig(), { store: suppliedStore, sftp: suppliedSftp } = {}) {
  const store = suppliedStore ?? new MenuTvStore(config.db, { seedDemoData: config.seedDemoData });
  const sftp = suppliedSftp ?? new SftpService(config.sftp);
  await initialiseStore(store, config);
  await recoverRuntimeState(store, sftp, config);

  const app = express();
  configureSecurity(app, config);
  mountPublicRoutes(app, { store, config });
  app.use('/api/auth', protectStateChangingRequest, createAuthRouter({ store, config }));

  const resolveSession = createSessionResolver(store, config);
  const { requireApiSession, requirePageSession } = createSessionMiddleware(resolveSession);
  const dependencies = { store, sftp, config };
  mountProtectedApi(app, dependencies, requireApiSession);
  mountFrontend(app, requirePageSession);
  app.use(errorHandler);

  return { app, store, config };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const service = await createApp();
  const server = service.app.listen(service.config.port, service.config.host, () => {
    logger.info('Menu TV server started', {
      app: service.config.appName,
      host: service.config.host,
      port: service.config.port
    });
  });
  const maintenanceTimer = setInterval(
    () => {
      void cleanupDeviceActivations(service.store, service.config);
      void cleanupEvents(service.store, service.config);
    },
    service.config.deviceActivationCleanupMinutes * 60 * 1000
  );
  maintenanceTimer.unref();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      clearInterval(maintenanceTimer);
      logger.info('Menu TV server stopping', { signal });
      server.close(() => void service.store.close());
    });
  }
}
