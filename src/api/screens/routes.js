import express from 'express';
import { menuDraftInput, positiveId, screenInput } from '../../contracts/input.js';
import { menuSettingsInput } from '../../contracts/menu-settings.js';
import { MENU_THEME_OVERRIDE_KEYS, MENU_THEME_SCHEMA_VERSION, menuThemeCatalog, menuThemeInput, validateMenuThemeBindings } from '../../contracts/menu-theme.js';
import { sceneInput } from '../../contracts/scene.js';
import { constructorThemeTemplateInput } from '../../contracts/theme-template.js';
import { ValidationError } from '../../shared/errors.js';
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
  const draft = await tx.getScreenDraft(source.id);
  const created = await tx.createScreen({ location_id: targetLocationId, resolution: source.resolution, status: 'draft', active: source.active !== false });
  const saved = await tx.saveScreenDraft(created.id, {
    rows: structuredClone(draft.rows || []),
    settings: menuSettingsInput(draft.settings || {}, settingsOptions(config)),
    scene: structuredClone(draft.scene || { version: 1, elements: [] })
  }, 1);
  if (!saved) throw conflict('Не удалось создать независимую копию монитора.');
  await tx.markScreenRenderChanged([created.id], ['screen', 'menu', 'scene'], 'screen.cloned', updatedBy);
  return tx.getScreen(created.id);
}

function draftRevisionHeader(request) {
  return positiveId(request.get('x-draft-revision'), 'x-draft-revision');
}

function sceneAssetUrls(scene) {
  if (!Array.isArray(scene?.elements)) return [];
  return scene.elements
    .map((element) => String(element?.media?.source_url || ''))
    .filter((url) => url.startsWith('/site-assets/scene/') || url.startsWith('/site-assets/content/'));
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

const BULK_SCENE_KINDS = new Set(['weather', 'image']);

function bulkTargetScreenIds(value, sourceScreenId) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new ValidationError('Выберите от 1 до 100 мониторов для применения настроек.');
  }
  const ids = [...new Set(value.map((item) => positiveId(item, 'target_screen_ids')))].sort((a, b) => a - b);
  if (ids.includes(sourceScreenId)) throw new ValidationError('Текущий монитор нельзя выбирать как целевой.');
  return ids;
}

function bulkElementTypeIndex(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 63) {
    throw new ValidationError('Позиция элемента для комплексного применения некорректна.');
  }
  return number;
}

function copiedElementId(sourceElement, targetScreenId, typeIndex) {
  return `applied-${sourceElement.type}-${targetScreenId}-${typeIndex + 1}`.slice(0, 120);
}

function applyElementToScene(scene, sourceElement, typeIndex, targetScreenId, config) {
  const elements = structuredClone(Array.isArray(scene?.elements) ? scene.elements : []);
  const fallbackId = copiedElementId(sourceElement, targetScreenId, typeIndex);
  let targetIndex = elements.findIndex((item) => item?.type === sourceElement.type && item?.id === sourceElement.id);
  if (targetIndex < 0) targetIndex = elements.findIndex((item) => item?.type === sourceElement.type && item?.id === fallbackId);

  const sameTypeIndexes = elements
    .map((item, index) => item?.type === sourceElement.type ? index : -1)
    .filter((index) => index >= 0);
  if (targetIndex < 0) {
    targetIndex = sourceElement.type === 'weather'
      ? (sameTypeIndexes[0] ?? -1)
      : (sameTypeIndexes[typeIndex] ?? -1);
  }

  const nextElement = structuredClone(sourceElement);
  if (targetIndex >= 0) {
    nextElement.id = elements[targetIndex].id;
    elements[targetIndex] = nextElement;
  } else {
    if (elements.some((item) => item?.id === nextElement.id)) nextElement.id = fallbackId;
    if (elements.some((item) => item?.id === nextElement.id)) {
      throw new ValidationError('На целевом мониторе конфликт идентификаторов элементов. Переименуйте конфликтующий элемент и повторите применение.');
    }
    elements.push(nextElement);
  }
  return sceneInput({ version: 1, elements }, { maxWidth: config.screenMaxWidth, maxHeight: config.screenMaxHeight });
}


function sceneElementByType(scene, type, index = 0) {
  return (Array.isArray(scene?.elements) ? scene.elements : []).filter((item) => item?.type === type)[index] || null;
}

function bulkThemeElement(value, expectedType, config) {
  if (!value) return null;
  const element = sceneInput(
    { version:1, elements:[value] },
    { maxWidth:config.screenMaxWidth, maxHeight:config.screenMaxHeight }
  ).elements[0];
  if (element?.type !== expectedType) throw new ValidationError(`Элемент темы должен иметь тип «${expectedType}».`);
  return element;
}

function themeOverridePatch(theme, value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const allowed = new Set(MENU_THEME_OVERRIDE_KEYS);
  const requested = new Set(Array.isArray(theme?.overrides) ? theme.overrides : []);
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => allowed.has(key) && requested.has(key))
  );
}

export function createScreensRouter({ store, config, realtime }) {
  const router = express.Router();

  router.get('/screens', async (_request, response) => response.json(await store.listScreens()));
  router.get('/screens/menu-themes', (_request, response) => response.json({ schema_version:MENU_THEME_SCHEMA_VERSION, presets:menuThemeCatalog() }));

  router.get('/screens/menu-themes/custom', async (_request,response) => {
    const templates=await store.listMenuThemeTemplates();
    response.json(templates.map(({id,name,created_by,updated_by,created_at,updated_at})=>({id,name,created_by,updated_by,created_at,updated_at})));
  });

  router.get('/screens/menu-themes/custom/:templateId', async (request,response) => {
    const template=await store.getMenuThemeTemplate(positiveId(request.params.templateId,'templateId'));
    if(!template) throw notFound();
    response.json(template);
  });

  router.post('/screens/menu-themes/custom', async (request,response) => {
    const input=constructorThemeTemplateInput(request.body,{maxWidth:config.screenMaxWidth,maxHeight:config.screenMaxHeight,maxBytes:config.menuDraftMaxBytes});
    let saved;
    try { saved=await store.createMenuThemeTemplate({...input,username:request.session.sub}); }
    catch(error) {
      if(error?.code==='23505') throw new ValidationError('Пользовательская тема с таким названием уже существует.');
      throw error;
    }
    await activity(store,request,{action:'menu_theme_template.created',entity_type:'menu_theme_template',entity_id:saved.id,message:`Сохранена пользовательская тема «${saved.name}».`});
    response.status(201).json(saved);
  });

  router.put('/screens/menu-themes/custom/:templateId', async (request,response) => {
    const id=positiveId(request.params.templateId,'templateId');
    const previous=await store.getMenuThemeTemplate(id);
    if(!previous) throw notFound();
    const input=constructorThemeTemplateInput(request.body,{maxWidth:config.screenMaxWidth,maxHeight:config.screenMaxHeight,maxBytes:config.menuDraftMaxBytes});
    let saved;
    try { saved=await store.updateMenuThemeTemplate(id,{...input,username:request.session.sub}); }
    catch(error) {
      if(error?.code==='23505') throw new ValidationError('Пользовательская тема с таким названием уже существует.');
      throw error;
    }
    const previousBackground=String(previous.settings?.background_image_url || '');
    if(previousBackground && previousBackground!==saved.settings?.background_image_url) await deleteScreenBackground(previousBackground,{store,config});
    const nextAssets=new Set(sceneAssetUrls(saved.scene));
    await Promise.all(sceneAssetUrls(previous.scene).filter((url)=>!nextAssets.has(url)).map((url)=>deleteSceneAsset(url,{store,config})));
    await activity(store,request,{action:'menu_theme_template.updated',entity_type:'menu_theme_template',entity_id:saved.id,message:`Обновлена пользовательская тема «${saved.name}».`});
    response.json(saved);
  });

  router.delete('/screens/menu-themes/custom/:templateId', async (request,response) => {
    const id=positiveId(request.params.templateId,'templateId');
    const removed=await store.deleteMenuThemeTemplate(id);
    if(!removed) throw notFound();
    const background=String(removed.settings?.background_image_url || '');
    if(background) await deleteScreenBackground(background,{store,config});
    await Promise.all(sceneAssetUrls(removed.scene).map((url)=>deleteSceneAsset(url,{store,config})));
    await activity(store,request,{action:'menu_theme_template.deleted',entity_type:'menu_theme_template',entity_id:id,message:`Удалена пользовательская тема «${removed.name}».`});
    response.status(204).end();
  });

  router.post('/screens/menu-themes/custom/:templateId/apply', async (request,response) => {
    const template=await store.getMenuThemeTemplate(positiveId(request.params.templateId,'templateId'));
    if(!template) throw notFound();
    const input=constructorThemeTemplateInput({name:template.name,settings:template.settings,scene:template.scene},{maxWidth:config.screenMaxWidth,maxHeight:config.screenMaxHeight,maxBytes:config.menuDraftMaxBytes});
    const values=Array.isArray(request.body?.target_screen_ids) ? request.body.target_screen_ids : [];
    if(values.length<1 || values.length>100) throw new ValidationError('Выберите от 1 до 100 мониторов.');
    const targetIds=[...new Set(values.map((value)=>positiveId(value,'target_screen_ids')))].sort((a,b)=>a-b);
    const result=await store.transaction(async (tx)=>{
      const applied=[],droppedBackgrounds=[],droppedAssets=[];
      for(const screenId of targetIds) {
        if(!await tx.lockScreen(screenId)) throw notFound();
        const draft=await tx.getScreenDraft(screenId);
        const previousBackground=String(draft.settings?.background_image_url || '');
        const previousAssets=new Set(sceneAssetUrls(draft.scene));
        const saved=await tx.saveScreenDraft(screenId,{rows:draft.rows || [],settings:structuredClone(input.settings),scene:structuredClone(input.scene)},Number(draft.revision || 0));
        if(!saved) throw conflict('Один из выбранных мониторов был изменён параллельно. Повторите применение.');
        if(previousBackground && previousBackground!==saved.settings?.background_image_url) droppedBackgrounds.push(previousBackground);
        const nextAssets=new Set(sceneAssetUrls(saved.scene));
        droppedAssets.push(...[...previousAssets].filter((url)=>!nextAssets.has(url)));
        applied.push(screenId);
      }
      const revisions=await tx.markScreenRenderChanged(applied,['menu','scene'],'menu_theme_template.applied',request.session.sub);
      return {applied,revisions,droppedBackgrounds,droppedAssets};
    });
    await Promise.all([...new Set(result.droppedBackgrounds)].map((url)=>deleteScreenBackground(url,{store,config})));
    await Promise.all([...new Set(result.droppedAssets)].map((url)=>deleteSceneAsset(url,{store,config})));
    await activity(store,request,{action:'menu_theme_template.applied',entity_type:'menu_theme_template',entity_id:template.id,message:`Пользовательская тема «${template.name}» применена к мониторам: ${result.applied.join(', ')}.`});
    notifyRevisions(realtime,result.revisions);
    response.json({applied_screen_ids:result.applied,applied_screens:result.revisions.map((item)=>({screen_id:item.screen_id,revision:item.revision}))});
  });
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
    const [draft, products, packaging] = await Promise.all([
      store.getScreenDraft(id),
      store.listProducts(),
      store.listPackaging()
    ]);
    response.json({ screen, draft, products, packaging });
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

  router.put('/screens/:id/scene/apply', async (request, response) => {
    const sourceScreenId = positiveId(request.params.id, 'id');
    const sourceScreen = await store.getScreen(sourceScreenId);
    if (!sourceScreen) throw notFound();

    const kind = String(request.body?.kind || '');
    if (kind !== 'background' && kind !== 'theme' && !BULK_SCENE_KINDS.has(kind)) {
      throw new ValidationError('Комплексное применение поддерживает тему, фон, погоду и картинку.');
    }
    const targetScreenIds = bulkTargetScreenIds(request.body?.target_screen_ids, sourceScreenId);
    const typeIndex = kind === 'background' || kind === 'theme' ? 0 : bulkElementTypeIndex(request.body?.type_index ?? 0);
    const sourceElement = kind === 'background' || kind === 'theme'
      ? null
      : sceneInput(
        { version: 1, elements: [request.body?.element] },
        { maxWidth: config.screenMaxWidth, maxHeight: config.screenMaxHeight }
      ).elements[0];
    if (sourceElement && sourceElement.type !== kind) {
      throw new ValidationError('Тип применяемого элемента не совпадает с выбранным свойством.');
    }
    const sourceTheme = kind === 'theme' ? menuThemeInput(request.body?.theme) : null;
    const sourceLogo = kind === 'theme' ? bulkThemeElement(request.body?.bound_elements?.logo, 'logo', config) : null;
    const sourceWeather = kind === 'theme' ? bulkThemeElement(request.body?.bound_elements?.weather, 'weather', config) : null;
    const overridePatch = kind === 'theme' ? themeOverridePatch(sourceTheme, request.body?.override_settings) : {};
    if (kind === 'theme') {
      const bindingScene = {
        version:1,
        elements:[sourceLogo,sourceWeather].filter(Boolean)
      };
      validateMenuThemeBindings(sourceTheme, bindingScene);
    }

    const result = await store.transaction(async (tx) => {
      const appliedScreenIds = [];
      const droppedBackgrounds = [];
      const droppedSceneAssets = [];

      for (const targetId of targetScreenIds) {
        if (!await tx.lockScreen(targetId)) throw new ValidationError('Один или несколько выбранных мониторов больше не существуют. Обновите список и повторите применение.');
        const draft = await tx.getScreenDraft(targetId);
        let nextSettings = draft.settings || {};
        let nextScene = draft.scene || { version: 1, elements: [] };

        if (kind === 'background') {
          const previousBackground = String(nextSettings.background_image_url || '');
          const background = request.body?.background && typeof request.body.background === 'object' && !Array.isArray(request.body.background)
            ? request.body.background
            : {};
          nextSettings = menuSettingsInput({
            ...nextSettings,
            background_color: background.background_color ?? nextSettings.background_color,
            background_image_url: background.background_image_url ?? nextSettings.background_image_url
          }, settingsOptions(config));
          if (previousBackground && previousBackground !== nextSettings.background_image_url) droppedBackgrounds.push(previousBackground);
        } else if (kind === 'theme') {
          const previousBackground = String(nextSettings.background_image_url || '');
          const previousAssets = new Set(sceneAssetUrls(nextScene));
          if (sourceLogo) nextScene = applyElementToScene(nextScene, sourceLogo, 0, targetId, config);
          if (sourceWeather) nextScene = applyElementToScene(nextScene, sourceWeather, 0, targetId, config);
          const mappedLogo = sourceLogo ? sceneElementByType(nextScene, 'logo', 0) : null;
          const mappedWeather = sourceWeather ? sceneElementByType(nextScene, 'weather', 0) : null;
          const mappedTheme = menuThemeInput({
            ...sourceTheme,
            brand:{ ...sourceTheme.brand, logo_element_id:mappedLogo?.id || '' },
            utility_slot:{ ...sourceTheme.utility_slot, weather_element_id:mappedWeather?.id || '' }
          });
          nextSettings = menuSettingsInput({
            ...nextSettings,
            ...overridePatch,
            theme:mappedTheme
          }, settingsOptions(config));
          validateMenuThemeBindings(nextSettings.theme, nextScene);
          if (previousBackground && previousBackground !== nextSettings.background_image_url) droppedBackgrounds.push(previousBackground);
          const nextAssets = new Set(sceneAssetUrls(nextScene));
          droppedSceneAssets.push(...[...previousAssets].filter((url) => !nextAssets.has(url)));
        } else {
          const previousAssets = new Set(sceneAssetUrls(nextScene));
          nextScene = applyElementToScene(nextScene, sourceElement, typeIndex, targetId, config);
          const nextAssets = new Set(sceneAssetUrls(nextScene));
          droppedSceneAssets.push(...[...previousAssets].filter((url) => !nextAssets.has(url)));
        }

        const saved = await tx.saveScreenDraft(targetId, {
          rows: draft.rows || [],
          settings: nextSettings,
          scene: nextScene
        }, Number(draft.revision || 0));
        if (!saved) throw conflict('Один из выбранных мониторов был изменён параллельно. Повторите применение.');
        appliedScreenIds.push(targetId);
      }

      const revisions = await tx.markScreenRenderChanged(
        appliedScreenIds,
        kind === 'theme' ? ['menu','scene'] : [kind === 'background' ? 'menu' : 'scene'],
        'screen.scene_settings.applied',
        request.session.sub
      );
      return { appliedScreenIds, revisions, droppedBackgrounds, droppedSceneAssets };
    });

    await Promise.all([
      ...new Set(result.droppedBackgrounds).values()
    ].map((url) => deleteScreenBackground(url, { store, config })));
    await Promise.all([
      ...new Set(result.droppedSceneAssets).values()
    ].map((url) => deleteSceneAsset(url, { store, config })));

    await activity(store, request, {
      action: 'screen.scene_settings.applied',
      entity_type: 'screen',
      entity_id: result.appliedScreenIds.join(','),
      message: `${kind === 'theme' ? 'Тема меню' : kind === 'background' ? 'Фон' : 'Элемент сцены'} применена к мониторам: ${result.appliedScreenIds.join(', ')}.`
    });
    notifyRevisions(realtime, result.revisions);
    response.json({
      applied_screen_ids: result.appliedScreenIds,
      applied_screens: result.revisions.map((item) => ({ screen_id: item.screen_id, revision: item.revision }))
    });
  });

  router.put('/screens/:id/draft', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const expectedRevision = positiveId(request.body?.revision, 'revision');
    const result = await store.transaction(async (tx) => {
      if (!await tx.lockScreen(id)) throw notFound();
      const current = await tx.getScreen(id);
      if (!current) throw notFound();
      const currentDraft = await tx.getScreenDraft(id);
      const previousSceneAssets = new Set(sceneAssetUrls(currentDraft?.scene));
      const draft = await menuDraftInput(request.body, tx, config.menuDraftMaxBytes, { maxWidth: config.screenMaxWidth, maxHeight: config.screenMaxHeight });
      draft.settings = menuSettingsInput(draft.settings, settingsOptions(config));
      validateMenuThemeBindings(draft.settings.theme, draft.scene);
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

      const changedComponents = changedDraftComponents(current, currentDraft, updatedScreen, saved);
      const revisions = changedComponents.length
        ? await tx.markScreenRenderChanged([id], changedComponents, 'screen.state.saved', request.session.sub)
        : [];
      const nextSceneAssets = new Set(sceneAssetUrls(saved.scene));
      const droppedSceneAssets = [...previousSceneAssets].filter((url) => !nextSceneAssets.has(url));
      return { screen: await tx.getScreen(id), draft:saved, revisions, droppedSceneAssets };
    });
    await Promise.all((result.droppedSceneAssets || []).map((url) => deleteSceneAsset(url, { store, config })));
    await activity(store, request, { action: 'screen.state.saved', entity_type: 'screen', entity_id: id, message: `Сохранено состояние монитора «${result.screen.name}».` });
    notifyRevisions(realtime, result.revisions);
    response.json({ screen:result.screen, draft:result.draft });
  });

  router.put('/screens/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const result = await store.transaction(async (tx) => {
      if (!await tx.lockScreen(id)) throw notFound();
      const current = await tx.getScreen(id);
      if (!current) throw notFound();
      const siteSettings = await tx.getSiteSettings();
      const next = screenInput({
        location_id: current.location_id,
        name: request.body?.name ?? current.name,
        resolution: request.body?.resolution ?? current.resolution,
        status: request.body?.status ?? current.status,
        active: request.body?.active ?? current.active
      }, {
        defaultScreenResolution: siteSettings.default_screen_resolution,
        maxWidth: config.screenMaxWidth,
        maxHeight: config.screenMaxHeight
      });
      if (sameJson(screenRenderState(current), screenRenderState(next))) {
        return { screen: current, revisions: [], changed: false };
      }
      const screen = await tx.updateScreen(id, next);
      if (!screen) throw notFound();
      const revisions = await tx.markScreenRenderChanged([id], ['screen'], 'screen.settings.updated', request.session.sub);
      return { screen, revisions, changed: true };
    });
    if (result.changed) {
      await activity(store, request, {
        action: 'screen.settings.updated',
        entity_type: 'screen',
        entity_id: id,
        message: `Обновлены параметры монитора «${result.screen.name}».`
      });
      notifyRevisions(realtime, result.revisions);
    }
    response.json(result.screen);
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
      await deleteScreenBackground(asset.publicUrl, { store, config });
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
