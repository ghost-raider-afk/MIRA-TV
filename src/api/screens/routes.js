import express from 'express';
import { menuDraftInput, positiveId, screenInput } from '../../contracts/input.js';
import { menuSettingsInput } from '../../contracts/menu-settings.js';
import { logger } from '../../logger/index.js';
import { createScreenBackground, deleteScreenBackground } from '../../services/screen-background-service.js';
import { activity, conflict, notFound } from '../helpers.js';

async function removeStagedBestEffort(sftp, key, context = {}) {
  if (!key || typeof sftp?.removeStaged !== 'function') return;
  await sftp.removeStaged(key).catch((error) => logger.warn('Stale screen staging file could not be removed', {
    staged_key: key,
    ...context,
    error
  }));
}

function settingsOptions(config) {
  return { allowBackgroundImage: true, maxWidth: config.screenMaxWidth, maxHeight: config.screenMaxHeight };
}

async function cloneScreen(tx, sourceId, targetLocationId, config, updatedBy) {
  const source = await tx.getScreen(sourceId);
  if (!source) throw notFound();
  const [draft, sourceAnimation] = await Promise.all([
    tx.getScreenDraft(source.id),
    tx.getScreenAnimationSettings(source.id)
  ]);
  const created = await tx.createScreen({
    location_id: targetLocationId,
    resolution: source.resolution,
    status: 'draft',
    active: source.active !== false
  });
  const saved = await tx.saveScreenDraft(created.id, {
    rows: structuredClone(draft.rows || []),
    settings: menuSettingsInput(draft.settings || {}, settingsOptions(config))
  }, 1);
  if (!saved) throw conflict('Не удалось создать независимую копию монитора.');
  if (sourceAnimation) {
    const applied = await tx.applyAnimationSettingsToScreens([created.id], sourceAnimation, updatedBy);
    if (applied.length !== 1) throw conflict('Не удалось создать независимую копию плейлиста монитора.');
  }
  return tx.getScreen(created.id);
}

function draftRevisionHeader(request) {
  return positiveId(request.get('x-draft-revision'), 'x-draft-revision');
}

export function createScreensRouter({ store, sftp, config }) {
  const router = express.Router();

  router.get('/screens', async (_request, response) => response.json(await store.listScreens()));
  router.get('/screens/:id', async (request, response) => {
    const screen = await store.getScreen(positiveId(request.params.id, 'id'));
    if (!screen) throw notFound();
    response.json(screen);
  });
  router.get('/screens/:id/editor', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const screen = await store.getScreen(id);
    if (!screen) throw notFound();
    const [draft, products, packaging] = await Promise.all([
      store.getScreenDraft(id), store.listProducts(), store.listPackaging()
    ]);
    response.json({ screen, draft, products, packaging });
  });

  router.put('/screens/:id/draft', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const expectedRevision = positiveId(request.body?.revision, 'revision');
    const result = await store.transaction(async (tx) => {
      if (!await tx.lockScreen(id)) throw notFound();
      const current = await tx.getScreen(id);
      if (!current) throw notFound();
      if (current.publication_pending_sha256) {
        throw conflict('Сейчас выполняется публикация этого монитора. Дождитесь её завершения и повторите сохранение.');
      }

      const draft = await menuDraftInput(request.body, tx, config.menuDraftMaxBytes);
      draft.settings = menuSettingsInput(draft.settings, settingsOptions(config));
      let screenData = {
        location_id: current.location_id,
        name: current.name,
        resolution: current.resolution,
        status: current.status,
        active: current.active
      };

      if (request.body?.screen && typeof request.body.screen === 'object' && !Array.isArray(request.body.screen)) {
        const siteSettings = await tx.getSiteSettings();
        screenData = screenInput(request.body.screen, {
          defaultScreenResolution: siteSettings.default_screen_resolution,
          maxWidth: config.screenMaxWidth,
          maxHeight: config.screenMaxHeight
        });
        if (!await tx.getLocation(screenData.location_id)) throw notFound();
        if (current.published_at && current.location_id !== screenData.location_id) {
          throw conflict('Опубликованный телевизор нельзя перенести в другую точку: его SFTP-путь должен остаться стабильным.');
        }
      }

      const updatedScreen = await tx.updateScreen(id, screenData);
      if (!updatedScreen) throw notFound();
      const saved = await tx.saveScreenDraft(id, draft, expectedRevision);
      if (!saved) {
        throw conflict('Меню уже было изменено в другом окне. Обновите редактор и повторите изменения.', { expected_revision: expectedRevision });
      }
      return {
        screen: await tx.getScreen(id),
        draft: saved,
        invalidatedAssetKey: current.prepared_asset_key || null
      };
    });

    await removeStagedBestEffort(sftp, result.invalidatedAssetKey, { screen_id: id });
    await activity(store, request, { action: 'screen.draft.saved', entity_type: 'screen', entity_id: id, message: `Сохранён черновик меню монитора «${result.screen.name}».` });
    response.json({ screen: result.screen, draft: result.draft });
  });

  router.put(
    '/screens/:id/background',
    express.raw({ type: ['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'], limit: config.screenBackgroundMaxBytes }),
    async (request, response) => {
      const id = positiveId(request.params.id, 'id');
      const expectedRevision = draftRevisionHeader(request);
      const asset = await createScreenBackground(request.body, config);
      let previousUrl = '';
      try {
        const result = await store.transaction(async (tx) => {
          if (!await tx.lockScreen(id)) throw notFound();
          const screen = await tx.getScreen(id);
          if (!screen) throw notFound();
          if (screen.publication_pending_sha256) throw conflict('Дождитесь завершения публикации перед сменой фона.');
          const draft = await tx.getScreenDraft(id);
          previousUrl = draft.settings?.background_image_url || '';
          const settings = menuSettingsInput({ ...draft.settings, background_image_url: asset.publicUrl }, settingsOptions(config));
          const saved = await tx.saveScreenDraft(id, { rows: draft.rows || [], settings }, expectedRevision);
          if (!saved) throw conflict('Черновик уже изменён в другом окне. Обновите редактор.');
          return { screen: await tx.getScreen(id), draft: saved };
        });
        if (previousUrl && previousUrl !== asset.publicUrl) await deleteScreenBackground(previousUrl, { store, config });
        await activity(store, request, { action: 'screen.background.updated', entity_type: 'screen', entity_id: id, message: `Обновлён фон монитора «${result.screen.name}».` });
        response.json(result);
      } catch (error) {
        await deleteScreenBackground(asset.publicUrl, { store, config, force: true });
        throw error;
      }
    }
  );

  router.delete('/screens/:id/background', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const expectedRevision = draftRevisionHeader(request);
    let previousUrl = '';
    const result = await store.transaction(async (tx) => {
      if (!await tx.lockScreen(id)) throw notFound();
      const screen = await tx.getScreen(id);
      if (!screen) throw notFound();
      if (screen.publication_pending_sha256) throw conflict('Дождитесь завершения публикации перед удалением фона.');
      const draft = await tx.getScreenDraft(id);
      previousUrl = draft.settings?.background_image_url || '';
      const settings = menuSettingsInput({ ...draft.settings, background_image_url: '' }, settingsOptions(config));
      const saved = await tx.saveScreenDraft(id, { rows: draft.rows || [], settings }, expectedRevision);
      if (!saved) throw conflict('Черновик уже изменён в другом окне. Обновите редактор.');
      return { screen: await tx.getScreen(id), draft: saved };
    });
    if (previousUrl) await deleteScreenBackground(previousUrl, { store, config });
    await activity(store, request, { action: 'screen.background.removed', entity_type: 'screen', entity_id: id, message: `Удалён фон монитора «${result.screen.name}».` });
    response.json(result);
  });

  router.post('/locations/:id/screens', async (request, response) => {
    const locationId = positiveId(request.params.id, 'id');
    const sourceId = request.body?.source_screen_id ? positiveId(request.body.source_screen_id, 'source_screen_id') : null;
    const screen = await store.transaction(async (tx) => {
      const location = await tx.getLocation(locationId);
      if (!location) throw notFound();
      if (sourceId) return cloneScreen(tx, sourceId, locationId, config, request.session.sub);
      const siteSettings = await tx.getSiteSettings();
      return tx.createScreen({
        location_id: locationId,
        resolution: siteSettings.default_screen_resolution,
        status: 'draft',
        active: true
      });
    });
    if (!screen) throw notFound();
    await activity(store, request, { action: 'screen.created', entity_type: 'screen', entity_id: screen.id, message: `Создан монитор «${screen.name}».` });
    response.status(201).json(screen);
  });

  router.delete('/screens/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const current = await store.getScreen(id);
    if (!current) throw notFound();
    const draft = await store.getScreenDraft(id);
    await removeStagedBestEffort(sftp, current.prepared_asset_key, { screen_id: id });
    if (draft?.settings?.background_image_url) await deleteScreenBackground(draft.settings.background_image_url, { store, config });
    if (!await store.deleteScreen(id)) throw notFound();
    await activity(store, request, { action: 'screen.deleted', entity_type: 'screen', entity_id: id, message: `Удалён монитор «${current.name}».` });
    response.status(204).end();
  });

  return router;
}
