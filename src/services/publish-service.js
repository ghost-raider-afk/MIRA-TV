import { logger } from '../logger/index.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { validateScreenJpeg } from './image-validation.js';

function publicationMatches(screen, info) {
  return Boolean(
    screen?.publication_pending_sha256 &&
    info?.sha256 &&
    info.sha256 === screen.publication_pending_sha256
  );
}

function sameRevision(left, right) {
  const leftRevision = Number(left);
  const rightRevision = Number(right);
  return Number.isSafeInteger(leftRevision) && leftRevision > 0 && leftRevision === rightRevision;
}

export function createPublishService({ store, sftp, config }) {
  if (!config?.imageMaxPixels) throw new Error('Publish service requires IMAGE_MAX_PIXELS from runtime config.');
  if (typeof store?.transaction !== 'function') throw new Error('Publish service requires transactional store access.');

  async function finishPublished(screen) {
    const stagedKey = screen.prepared_asset_key;
    const updated = await store.transaction(async (tx) => {
      if (!await tx.lockScreen(screen.id)) throw new NotFoundError();
      const current = await tx.getScreen(screen.id);
      if (!current || current.publication_pending_sha256 !== screen.publication_pending_sha256) {
        throw new ConflictError('Состояние публикации изменилось. Обновите страницу и повторите действие.');
      }
      const record = await tx.markScreenPublished(screen.id, screen.publication_pending_sha256);
      if (!record) throw new ConflictError('Состояние публикации изменилось. Обновите страницу и повторите действие.');
      return record;
    });
    if (stagedKey) {
      await sftp.removeStaged(stagedKey).catch((error) => logger.warn('Published staging file could not be removed', {
        screen_id: screen.id,
        staged_key: stagedKey,
        error
      }));
    }
    return updated;
  }

  return Object.freeze({
    async stageJpeg(screenId, bytes) {
      const initialScreen = await store.getScreen(screenId);
      if (!initialScreen) throw new NotFoundError();
      if (initialScreen.publication_pending_sha256) {
        throw new ConflictError('Сейчас выполняется публикация этого монитора. Дождитесь её завершения перед подготовкой нового JPEG.');
      }
      const initialDraft = await store.getScreenDraft(screenId);
      if (!initialDraft?.revision) throw new ConflictError('Черновик монитора не найден. Сохраните меню и повторите подготовку JPEG.');
      await validateScreenJpeg(bytes, initialScreen.resolution, config.imageMaxPixels);

      const asset = await sftp.stageJpeg(screenId, bytes);
      let result;
      try {
        result = await store.transaction(async (tx) => {
          if (!await tx.lockScreen(screenId)) throw new NotFoundError();
          const [current, draft] = await Promise.all([tx.getScreen(screenId), tx.getScreenDraft(screenId)]);
          if (!current) throw new NotFoundError();
          if (current.publication_pending_sha256) {
            throw new ConflictError('Сейчас выполняется публикация этого монитора. Дождитесь её завершения перед подготовкой нового JPEG.');
          }
          if (current.resolution !== initialScreen.resolution || !sameRevision(draft.revision, initialDraft.revision)) {
            throw new ConflictError('Меню изменилось во время подготовки JPEG. Сохраните актуальную версию и повторите операцию.');
          }
          const previousKey = current.prepared_asset_key || null;
          const updated = await tx.savePreparedAsset(screenId, asset, Number(draft.revision));
          if (!updated) throw new ConflictError('Меню изменилось во время подготовки JPEG. Сохраните актуальную версию и повторите операцию.');
          return { updated, previousKey };
        });
      } catch (error) {
        await sftp.removeStaged(asset.key).catch(() => undefined);
        throw error;
      }

      if (result.previousKey && result.previousKey !== asset.key) {
        await sftp.removeStaged(result.previousKey).catch((error) => logger.warn('Superseded staging file could not be removed', {
          screen_id: screenId,
          staged_key: result.previousKey,
          error
        }));
      }
      return result.updated;
    },

    async publish(screenId) {
      let screen = await store.getScreen(screenId);
      if (!screen) throw new NotFoundError();
      if (!screen.sftp_directory_name) throw new ConflictError('Сначала вручную привяжите SFTP-каталог к точке.');

      if (screen.publication_pending_sha256) {
        const info = await sftp.publishedInfo(screen.sftp_directory_name, screen.delivery_filename);
        if (publicationMatches(screen, info)) return finishPublished(screen);
      }

      screen = await store.transaction(async (tx) => {
        if (!await tx.lockScreen(screenId)) throw new NotFoundError();
        const [current, draft] = await Promise.all([tx.getScreen(screenId), tx.getScreenDraft(screenId)]);
        if (!current) throw new NotFoundError();
        if (!current.sftp_directory_name) throw new ConflictError('Сначала вручную привяжите SFTP-каталог к точке.');
        if (current.publication_pending_sha256) {
          throw new ConflictError('Публикация этого монитора уже выполняется. Обновите страницу через несколько секунд.');
        }
        if (!current.prepared_asset_key || !current.prepared_asset_sha256 || !current.prepared_draft_revision) {
          throw new ConflictError('Сначала сохраните текущее меню и подготовьте JPEG.');
        }
        if (!draft?.revision || !sameRevision(current.prepared_draft_revision, draft.revision)) {
          throw new ConflictError('Подготовленный JPEG относится к предыдущей версии меню. Сохраните меню заново.');
        }
        const started = await tx.markPublicationStarted(current.id, current.prepared_asset_sha256, Number(draft.revision));
        if (!started) throw new ConflictError('Меню или подготовленный JPEG изменились. Обновите страницу и повторите публикацию.');
        return started;
      });

      const expectedSha256 = screen.prepared_asset_sha256;
      try {
        const info = await sftp.publish({
          directoryName: screen.sftp_directory_name,
          deliveryFilename: screen.delivery_filename,
          stagedKey: screen.prepared_asset_key,
          expectedSha256
        });
        if (info.sha256 !== expectedSha256) throw new ConflictError('Контрольная сумма опубликованного JPEG не совпала.');
      } catch (error) {
        await store.clearPublicationPending(screen.id, expectedSha256).catch((dbError) => logger.warn('Publication pending state could not be cleared', {
          screen_id: screen.id,
          expected_sha256: expectedSha256,
          error: dbError
        }));
        throw error;
      }

      screen = await store.getScreen(screen.id);
      if (!screen?.publication_pending_sha256) {
        throw new ConflictError('Состояние публикации изменилось до подтверждения.');
      }
      return finishPublished(screen);
    },

    async reconcilePending() {
      const pending = await store.listPendingPublications();
      const result = { recovered: 0, unresolved: 0 };
      for (const screen of pending) {
        if (!screen.sftp_directory_name || !screen.delivery_filename) {
          result.unresolved += 1;
          continue;
        }
        try {
          const info = await sftp.publishedInfo(screen.sftp_directory_name, screen.delivery_filename);
          if (!publicationMatches(screen, info)) {
            result.unresolved += 1;
            continue;
          }
          await finishPublished(screen);
          result.recovered += 1;
        } catch (error) {
          result.unresolved += 1;
          logger.warn('Pending publication could not be reconciled', { screen_id: screen.id, error });
        }
      }
      return result;
    },

    async cleanupStaging(options) {
      const keys = await store.listPreparedAssetKeys();
      return sftp.cleanupStaging(keys, options);
    }
  });
}
