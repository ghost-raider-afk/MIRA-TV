import express from 'express';
import { menuDraftInput, positiveId, screenInput } from '../../contracts/input.js';
import { animationSettingsInput } from '../../contracts/animation.js';
import { menuSettingsInput } from '../../contracts/menu-settings.js';
import { createScreenBackground, deleteScreenBackground } from '../../services/screen-background-service.js';
import { createSceneAssetStream, deleteSceneAsset } from '../../services/scene-assets-service.js';
import { activity, conflict, notFound } from '../helpers.js';

function settingsOptions(config) {
  return { allowBackgroundImage: true, maxWidth: config.screenMaxWidth, maxHeight: config.screenMaxHeight };
}

function notifyRevisions(realtime, revisions) {
  for (const item of revisions || []) realtime?.notifyScreen(item.screen_id, item.revision);
}

async function cloneScreen(tx, sourceId, targetLocationId, config, updatedBy) {
  const source = await tx.getScreen(sourceId);
  if (!source) throw notFound();
  const [draft, sourceAnimation] = await Promise.all([
    tx.getScreenDraft(source.id), tx.getScreenAnimationSettings(source.id)
  ]);
  const created = await tx.createScreen({ location_id: targetLocationId, resolution: source.resolution, status: 'draft', active: source.active !== false });
  const saved = await tx.saveScreenDraft(created.id, {
    rows: structuredClone(draft.rows || []),
    settings: menuSettingsInput(draft.settings || {}, settingsOptions(config)),
    scene: structuredClone(draft.scene || { version: 1, elements: [] })
  }, 1);
  if (!saved) throw conflict('Не удалось создать независимую копию монитора.');
  if (sourceAnimation) {
    const applied = await tx.applyAnimationSettingsToScreens([created.id], sourceAnimation, updatedBy);
    if (applied.length !== 1) throw conflict('Не удалось создать независимую копию плейлиста монитора.');
  }
  await tx.markScreenRenderChanged([created.id], ['screen', 'menu', 'scene', 'animation', 'scene_playlist'], 'screen.cloned', updatedBy);
  return tx.getScreen(created.id);
}

function draftRevisionHeader(request) {
  return positiveId(request.get('x-draft-revision'), 'x-draft-revision');
}

function sceneAssetUrls(scene) {
  if (!Array.isArray(scene?.elements)) return [];
  return scene.elements
    .map((element) => String(element?.media?.source_url || ''))
    .filter((url) => url.startsWith('/site-assets/scene/'));
}

function sameJson(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function screenRenderState(screen) {
  return {
    location_id: Number(screen?.location_id),
    name: String(screen?.name || ''),
    resolution: String(screen?.resolution || ''),
    status: String(screen?.status || ''),
    active: screen?.active !== false
  };
}

function changedDraftComponents(currentScreen, currentDraft, nextScreen, nextDraft) {
  const changed = [];
  if (!sameJson(screenRenderState(currentScreen), screenRenderState(nextScreen))) changed.push('screen');
  if (!sameJson(currentDraft?.rows || [], nextDraft?.rows || [])
      || !sameJson(currentDraft?.settings || {}, nextDraft?.settings || {})) changed.push('menu');
  if (!sameJson(currentDraft?.scene || { version: 1, elements: [] }, nextDraft?.scene || { version: 1, elements: [] })) changed.push('scene');
  return changed;
}

export function createScreensRouter({ store, config, realtime }) {
  const router = express.Router();

  router.get('/screens', async (_request, response) => response.json(await store.listScreens()));
  router.get('/screens/:id', async (request, response) => {
    const screen = await store.getScreen(positiveId(request.params.id, 'id'));
    if (!screen) throw notFound();
    response.json(screen);
  });
  router.get('/screens/:id/changes', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    if (!await store.getScreen(id)) throw notFound();
    response.json(await store.listScreenRenderEvents(id, request.query.limit));
  });
  router.get('/screens/:id/editor', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const screen = await store.getScreen(id);
    if (!screen) throw notFound();
    const [draft, products, packaging, screenAnimation, globalAnimation] = await Promise.all([
      store.getScreenDraft(id),
      store.listProducts(),
      store.listPackaging(),
      store.getScreenAnimationSettings(id),
      store.getAnimationSettings()
    ]);
    response.json({ screen, draft, products, packaging, animation:screenAnimation || globalAnimation });
  });

  router.put('/screens/:id/scene-asset', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const screen = await store.getScreen(id);
    if (!screen) throw notFound();
    const asset = await createSceneAssetStream({
      stream: request,
      contentLength: request.get('content-length'),
      contentType: request.get('content-type'),
      config
    });
    await activity(store, request, {
      action: 'screen.scene_asset.uploaded',
      entity_type: 'screen',
      entity_id: id,
      message: `Загружен медиафайл элемента для монитора «${screen.name}».`
    });
    response.status(201).json(asset);
  });

  router.put('/screens/:id/draft', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const expectedRevision = positiveId(request.body?.revision, 'revision');
    const result = await store.transaction(async (tx) => {
      if (!await tx.lockScreen(id)) throw notFound();
      const current = await tx.getScreen(id);
      if (!current) throw notFound();
      const currentDraft = await tx.getScreenDraft(id);
      const currentAnimation = await tx.getScreenAnimationSettings(id) || await tx.getAnimationSettings();
      const previousSceneAssets = new Set(sceneAssetUrls(currentDraft?.scene));
      const draft = await menuDraftInput(request.body, tx, config.menuDraftMaxBytes, { maxWidth: config.screenMaxWidth, maxHeight: config.screenMaxHeight });
      draft.settings = menuSettingsInput(draft.settings, settingsOptions(config));
      let screenData = { location_id: current.location_id, name: current.name, resolution: current.resolution, status: current.status, active: current.active };
      if (request.body?.screen && typeof request.body.screen === 'object' && !Array.isArray(request.body.screen)) {
        const siteSettings = await tx.getSiteSettings();
        screenData = screenInput(request.body.screen, { defaultScreenResolution: siteSettings.default_screen_resolution, maxWidth: config.screenMaxWidth, maxHeight: config.screenMaxHeight });
        if (!await tx.getLocation(screenData.location_id)) throw notFound();
      }
      const updatedScreen = await tx.updateScreen(id, screenData);
      if (!updatedScreen) throw notFound();
      const saved = await tx.saveScreenDraft(id, draft, expectedRevision);
      if (!saved) throw conflict('Меню уже было изменено в другом окне. Обновите редактор и повторите изменения.', { expected_revision: expectedRevision });

      let savedAnimation = currentAnimation;
      let animationChanged = false;
      if (request.body?.animation && typeof request.body.animation === 'object' && !Array.isArray(request.body.animation)) {
        savedAnimation = animationSettingsInput({
          ...(currentAnimation || {}),
          ...request.body.animation,
          scene_playlist:currentAnimation?.scene_playlist
        });
        animationChanged = !sameJson({
          enabled:currentAnimation?.enabled === true,
          preset_id:currentAnimation?.preset_id || 'cinematic-live-menu',
          profile:currentAnimation?.profile || {}
        }, {
          enabled:savedAnimation.enabled === true,
          preset_id:savedAnimation.preset_id,
          profile:savedAnimation.profile
        });
        if (animationChanged) {
          const applied = await tx.applyAnimationSettingsToScreens([id], savedAnimation, request.session.sub);
          if (applied.length !== 1) throw conflict('Не удалось сохранить анимацию текущего монитора.');
        }
      }

      const changedComponents = changedDraftComponents(current, currentDraft, updatedScreen, saved);
      if (animationChanged) changedComponents.push('animation');
      const revisions = changedComponents.length
        ? await tx.markScreenRenderChanged([id], changedComponents, 'screen.state.saved', request.session.sub)
        : [];
      const nextSceneAssets = new Set(sceneAssetUrls(saved.scene));
      const droppedSceneAssets = [...previousSceneAssets].filter((url) => !nextSceneAssets.has(url));
      return { screen: await tx.getScreen(id), draft: saved, animation:savedAnimation, revisions, droppedSceneAssets };
    });
    await Promise.all((result.droppedSceneAssets || []).map((url) => deleteSceneAsset(url, { store, config })));
    await activity(store, request, { action: 'screen.state.saved', entity_type: 'screen', entity_id: id, message: `Сохранено состояние монитора «${result.screen.name}».` });
    notifyRevisions(realtime, result.revisions);
    response.json({ screen: result.screen, draft: result.draft, animation:result.animation });
  });

  router.put('/screens/:id/background', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'], limit: config.screenBackgroundMaxBytes }), async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const expectedRevision = draftRevisionHeader(request);
    const asset = await createScreenBackground(request.body, config);
    let previousUrl = '';
    try {
      const result = await store.transaction(async (tx) => {
        if (!await tx.lockScreen(id)) throw notFound();
        const screen = await tx.getScreen(id);
        if (!screen) throw notFound();
        const draft = await tx.getScreenDraft(id);
        previousUrl = draft.settings?.background_image_url || '';
        const settings = menuSettingsInput({ ...draft.settings, background_image_url: asset.publicUrl }, settingsOptions(config));
        const saved = await tx.saveScreenDraft(id, { rows: draft.rows || [], settings, scene: draft.scene || { version: 1, elements: [] } }, expectedRevision);
        if (!saved) throw conflict('Состояние уже изменено в другом окне. Обновите редактор.');
        const revisions = await tx.markScreenRenderChanged([id], ['menu'], 'screen.background.updated', request.session.sub);
        return { screen: await tx.getScreen(id), draft: saved, revisions };
      });
      if (previousUrl && previousUrl !== asset.publicUrl) await deleteScreenBackground(previousUrl, { store, config });
      await activity(store, request, { action: 'screen.background.updated', entity_type: 'screen', entity_id: id, message: `Обновлён фон монитора «${result.screen.name}».` });
      notifyRevisions(realtime, result.revisions);
      response.json({ screen: result.screen, draft: result.draft });
    } catch (error) {
      await deleteScreenBackground(asset.publicUrl, { store, config, force: true });
      throw error;
    }
  });

  router.delete('/screens/:id/background', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const expectedRevision = draftRevisionHeader(request);
    let previousUrl = '';
    const result = await store.transaction(async (tx) => {
      if (!await tx.lockScreen(id)) throw notFound();
      const screen = await tx.getScreen(id);
      if (!screen) throw notFound();
      const draft = await tx.getScreenDraft(id);
      previousUrl = draft.settings?.background_image_url || '';
      const settings = menuSettingsInput({ ...draft.settings, background_image_url: '' }, settingsOptions(config));
      const saved = await tx.saveScreenDraft(id, { rows: draft.rows || [], settings, scene: draft.scene || { version: 1, elements: [] } }, expectedRevision);
      if (!saved) throw conflict('Состояние уже изменено в другом окне. Обновите редактор.');
      const revisions = await tx.markScreenRenderChanged([id], ['menu'], 'screen.background.removed', request.session.sub);
      return { screen: await tx.getScreen(id), draft: saved, revisions };
    });
    if (previousUrl) await deleteScreenBackground(previousUrl, { store, config });
    await activity(store, request, { action: 'screen.background.removed', entity_type: 'screen', entity_id: id, message: `Удалён фон монитора «${result.screen.name}».` });
    notifyRevisions(realtime, result.revisions);
    response.json({ screen: result.screen, draft: result.draft });
  });

  router.post('/locations/:id/screens', async (request, response) => {
    const locationId = positiveId(request.params.id, 'id');
    const sourceId = request.body?.source_screen_id ? positiveId(request.body.source_screen_id, 'source_screen_id') : null;
    const screen = await store.transaction(async (tx) => {
      const location = await tx.getLocation(locationId);
      if (!location) throw notFound();
      if (sourceId) return cloneScreen(tx, sourceId, locationId, config, request.session.sub);
      const siteSettings = await tx.getSiteSettings();
      const created = await tx.createScreen({ location_id: locationId, resolution: siteSettings.default_screen_resolution, status: 'draft', active: true });
      if (created) await tx.markScreenRenderChanged([created.id], ['screen', 'menu'], 'screen.created', request.session.sub);
      return created;
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
    const backgroundUrl = draft?.settings?.background_image_url || '';
    const sceneAssets = sceneAssetUrls(draft?.scene);
    if (!await store.deleteScreen(id)) throw notFound();
    realtime?.disconnectScreen(id);
    if (backgroundUrl) await deleteScreenBackground(backgroundUrl, { store, config });
    await Promise.all(sceneAssets.map((url) => deleteSceneAsset(url, { store, config })));
    await activity(store, request, { action: 'screen.deleted', entity_type: 'screen', entity_id: id, message: `Удалён монитор «${current.name}».` });
    response.status(204).end();
  });

  return router;
}
