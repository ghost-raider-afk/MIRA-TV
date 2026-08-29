import { logger } from '../logger/index.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { generateSftpPassword } from '../sftp/index.js';

const EMPTY_DIRECTORY_SUMMARY = Object.freeze({ file_count: 0, total_bytes: 0, last_modified_at: null });

async function createManagedSftpUser({ store, sftp, username, password, directoryName }) {
  try {
    await sftp.createReadOnlyUser({ username, password, directoryName });
    return;
  } catch (error) {
    if (error?.status !== 409) throw error;
    const owner = await store.getLocationBySftpUsername(username);
    if (owner) throw new ConflictError('Этот логин SFTP уже используется другой торговой точкой.');
    logger.warn('Removing orphaned SFTP user before retrying binding', { username, directory_name: directoryName });
    await sftp.removeUser(username);
    await sftp.createReadOnlyUser({ username, password, directoryName });
  }
}

export function createSftpAccessService({ store, sftp, config }) {
  async function directoryWithStatus(directory, { includeSummary = true } = {}) {
    const storageStatus = await sftp.directoryStatus(directory.name);
    let summary = EMPTY_DIRECTORY_SUMMARY;
    if (includeSummary && storageStatus === 'ready' && typeof sftp.directorySummary === 'function') {
      summary = await sftp.directorySummary(directory.name);
    }
    return { ...directory, storage_status: storageStatus, ...summary };
  }

  async function directoriesWithStatus() {
    const directories = await store.listSftpDirectories();
    return Promise.all(directories.map((directory) => directoryWithStatus(directory)));
  }

  function connection() {
    return {
      host: config.sftp.publicHost,
      port: config.sftp.port,
      access_mode: 'read-only',
      permissions: ['list', 'download'],
      source: '.env',
      api_timeout_ms: config.sftp.apiTimeoutMs,
      staging_max_age_hours: config.sftp.stagingMaxAgeHours,
      generated_password_length: config.generatedPasswordLength,
      screen_source_max_bytes: config.screenSourceMaxBytes
    };
  }

  return Object.freeze({
    connection,
    directoriesWithStatus,

    async overview() {
      const directories = await directoriesWithStatus();
      return {
        connection: connection(),
        totals: {
          directories: directories.length,
          ready_directories: directories.filter((item) => item.storage_status === 'ready').length,
          bound_directories: directories.filter((item) => Boolean(item.bound_location_id)).length,
          published_files: directories.reduce((total, item) => total + Number(item.file_count || 0), 0),
          published_bytes: directories.reduce((total, item) => total + Number(item.total_bytes || 0), 0)
        },
        directories
      };
    },

    async directoryFiles(id) {
      const directory = await store.getSftpDirectory(id);
      if (!directory) throw new NotFoundError();
      const storageStatus = await sftp.directoryStatus(directory.name);
      const files = storageStatus === 'ready' ? await sftp.listPublishedFiles(directory.name) : [];
      return { directory: await directoryWithStatus(directory), files };
    },

    async publishedFile(id, filename) {
      const directory = await store.getSftpDirectory(id);
      if (!directory) throw new NotFoundError();
      return { directory, file: await sftp.readPublishedFile(directory.name, filename) };
    },

    async provisionDirectory(id) {
      const directory = await store.getSftpDirectory(id);
      if (!directory) throw new NotFoundError();
      await sftp.provisionDirectory(directory.name);
      const updated = await store.markSftpDirectoryProvisioned(id);
      return directoryWithStatus(updated, { includeSummary: false });
    },

    async bindLocation(locationId, input) {
      const location = await store.getLocation(locationId);
      if (!location) throw new NotFoundError();
      if (location.sftp_directory_id) throw new ConflictError('Для изменения SFTP-каталога сначала явно отключите текущую привязку.');
      const directory = await store.getSftpDirectory(input.directoryId);
      if (!directory) throw new NotFoundError();
      if (directory.bound_location_id) throw new ConflictError('Этот SFTP-каталог уже привязан к другой точке.');
      const password = generateSftpPassword(config.generatedPasswordLength);
      await createManagedSftpUser({ store, sftp, username: input.username, password, directoryName: directory.name });
      let bound;
      try {
        bound = await store.bindLocationSftp(locationId, input);
      } catch (error) {
        await sftp.removeUser(input.username).catch((cleanupError) => logger.warn('SFTP user rollback failed after binding error', {
          username: input.username,
          error: cleanupError
        }));
        throw error;
      }
      if (!bound) {
        await sftp.removeUser(input.username).catch((cleanupError) => logger.warn('SFTP user rollback failed after binding conflict', {
          username: input.username,
          error: cleanupError
        }));
        throw new ConflictError('Точка уже получила SFTP-привязку. Обновите страницу.');
      }
      return {
        location: bound,
        credentials: { host: config.sftp.publicHost, port: config.sftp.port, username: input.username, password }
      };
    },

    async resetPassword(locationId) {
      const location = await store.getLocation(locationId);
      if (!location) throw new NotFoundError();
      if (!location.sftp_username) throw new ConflictError('У точки нет SFTP-доступа.');
      const password = generateSftpPassword(config.generatedPasswordLength);
      await sftp.resetPassword({ username: location.sftp_username, password });
      try {
        await store.touchLocationSftpPassword(location.id);
      } catch (error) {
        logger.warn('SFTP password changed but issuance timestamp could not be recorded', {
          location_id: location.id,
          username: location.sftp_username,
          error
        });
      }
      return {
        location,
        credentials: { host: config.sftp.publicHost, port: config.sftp.port, username: location.sftp_username, password }
      };
    },

    async unbindLocation(locationId) {
      const location = await store.getLocation(locationId);
      if (!location) throw new NotFoundError();
      if (!location.sftp_username) throw new ConflictError('У точки нет SFTP-доступа.');
      await sftp.removeUser(location.sftp_username);
      await store.unbindLocationSftp(location.id);
      return location;
    }
  });
}
