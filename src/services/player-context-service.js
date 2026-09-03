import crypto from 'node:crypto';
import { sceneMediaAssetIds } from '../contracts/scene.js';
import { createWeatherService } from './weather-service.js';

export const PLAYER_STATE_SCHEMA_VERSION = 1;

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('base64url');
}

function catalogIds(draft) {
  const productIds = new Set();
  const packagingIds = new Set();
  for (const row of draft?.rows || []) {
    const productId = Number(row?.product_id ?? row?.productId);
    const packagingId = Number(row?.packaging_id ?? row?.packagingId);
    if (Number.isSafeInteger(productId) && productId > 0) productIds.add(productId);
    if (Number.isSafeInteger(packagingId) && packagingId > 0) packagingIds.add(packagingId);
  }
  return { productIds: [...productIds], packagingIds: [...packagingIds] };
}

function sceneCatalogElements(scene) {
  const result = [];
  for (const slide of Array.isArray(scene?.slides) ? scene.slides : []) {
    for (const element of Array.isArray(slide?.elements) ? slide.elements : []) {
      if (element?.type === 'table' && ['catalog_items', 'catalog_products'].includes(element?.data_binding?.source)) result.push(element);
    }
  }
  return result;
}

function sceneUsesCatalog(scene) {
  return sceneCatalogElements(scene).length > 0;
}

async function universalCatalogItems(store) {
  if (typeof store.listCatalogItems === 'function') return store.listCatalogItems();
  if (typeof store.listProducts === 'function') return store.listProducts();
  return [];
}

function cloneScene(scene) {
  return typeof structuredClone === 'function' ? structuredClone(scene) : JSON.parse(JSON.stringify(scene));
}

async function resolvedSceneCatalog(store, sourceScene) {
  const elements = sceneCatalogElements(sourceScene);
  if (!elements.length) return { scene: sourceScene, catalogItems: [] };

  const viewIds = [...new Set(elements.map((element) => Number(element?.table?.view_id)).filter((id) => Number.isSafeInteger(id) && id > 0))];
  const hasUnfilteredElement = elements.some((element) => !(Number(element?.table?.view_id) > 0));
  if (hasUnfilteredElement || !viewIds.length || typeof store.listCatalogViewsByIds !== 'function') {
    return { scene: sourceScene, catalogItems: await universalCatalogItems(store) };
  }

  const views = await store.listCatalogViewsByIds(viewIds);
  const viewMap = new Map((views || []).map((view) => [Number(view.id), view]));
  const scene = cloneScene(sourceScene);
  const itemIds = new Set();

  for (const element of sceneCatalogElements(scene)) {
    const viewId = Number(element?.table?.view_id);
    const view = viewMap.get(viewId);
    const ids = Array.isArray(view?.item_ids)
      ? view.item_ids
      : Array.isArray(element?.table?.item_ids) ? element.table.item_ids : [];
    element.table.item_ids = [...new Set(ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
    for (const id of element.table.item_ids) itemIds.add(id);
  }

  let catalogItems;
  if (typeof store.listCatalogItemsByIds === 'function') catalogItems = await store.listCatalogItemsByIds([...itemIds]);
  else catalogItems = (await universalCatalogItems(store)).filter((item) => itemIds.has(Number(item.id)));
  return { scene, catalogItems };
}

function sceneWeatherElements(scene) {
  const elements = [];
  for (const slide of Array.isArray(scene?.slides) ? scene.slides : []) {
    for (const element of Array.isArray(slide?.elements) ? slide.elements : []) {
      if (element?.type !== 'weather') continue;
      const location = String(element?.weather?.location || '').trim();
      if (location.length >= 2) elements.push({ id: element.id, location });
    }
  }
  return elements;
}

function playerWeatherData(data) {
  if (!data) return null;
  return {
    requested_location: data.requested_location || '',
    location: data.location || '',
    region: data.region || '',
    country: data.country || '',
    current: data.current || null,
    daily: Array.isArray(data.daily) ? data.daily : [],
    stale: data.stale === true
  };
}

async function sceneWeatherData(scene, config) {
  const elements = sceneWeatherElements(scene);
  if (!elements.length) return {};
  const service = createWeatherService(config);
  const byLocation = new Map();
  for (const element of elements) {
    const key = element.location.toLocaleLowerCase('ru-RU');
    if (!byLocation.has(key)) byLocation.set(key, service.get(element.location).then(playerWeatherData).catch(() => null));
  }
  const values = await Promise.all(elements.map(async (element) => {
    const data = await byLocation.get(element.location.toLocaleLowerCase('ru-RU'));
    return data ? [element.id, data] : null;
  }));
  return Object.fromEntries(values.filter(Boolean));
}

function screenComponent(screen) {
  return {
    id: screen.id,
    name: screen.name,
    resolution: screen.resolution,
    status: screen.status,
    location_id: screen.location_id,
    location_name: screen.location_name,
    location_number: screen.location_number
  };
}

function runtimeComponent(config) {
  return {
    fallback_poll_interval_ms: config.playerFallbackPollSeconds * 1000,
    log_batch_size: config.playerLogBatchSize,
    log_local_max_entries: config.playerLogLocalMaxEntries,
    log_local_max_bytes: config.playerLogLocalMaxBytes,
    weather_refresh_interval_ms: config.weatherPlayerRefreshSeconds * 1000
  };
}

async function publishedSceneComponent(store, screenId, config) {
  const assignment = await store.getScreenSceneAssignment(screenId);
  if (!assignment) return null;
  const revision = await store.getSceneRevision(assignment.scene_revision_id);
  if (!revision) return null;

  const resolvedCatalog = sceneUsesCatalog(revision.scene)
    ? await resolvedSceneCatalog(store, revision.scene)
    : { scene: revision.scene, catalogItems: [] };
  const scene = resolvedCatalog.scene;
  const mediaIds = sceneMediaAssetIds(scene);
  const [mediaAssets, weatherByElement] = await Promise.all([
    mediaIds.length ? store.listMediaAssetsByIds(mediaIds) : [],
    sceneWeatherData(scene, config)
  ]);
  return {
    revision_id: revision.id,
    scene_id: revision.scene_id,
    scene_name: revision.scene_name,
    revision_number: revision.revision_number,
    published_at: revision.published_at,
    graph: scene,
    catalog_items: resolvedCatalog.catalogItems,
    media_assets: mediaAssets,
    weather_by_element: weatherByElement
  };
}

export async function buildPlayerState(store, session, config) {
  const [screen, draft, animationSettings, publishedScene] = await Promise.all([
    store.getScreen(session.screen_id),
    store.getScreenDraft(session.screen_id),
    store.getScreenAnimationSettings(session.screen_id),
    publishedSceneComponent(store, session.screen_id, config)
  ]);
  if (!screen || screen.active === false) return null;

  const { productIds, packagingIds } = catalogIds(draft);
  const [products, packaging] = await Promise.all([
    store.listProductsByIds(productIds),
    store.listPackagingByIds(packagingIds)
  ]);

  const components = {
    screen: screenComponent(screen),
    menu: { draft: { rows: draft.rows || [], settings: draft.settings || {}, revision: draft.revision }, products, packaging },
    animation: { enabled: animationSettings?.enabled === true, profile: animationSettings?.profile || null },
    environment: animationSettings?.environment || null,
    scene_playlist: animationSettings?.scene_playlist || null,
    entity: animationSettings?.entity || null,
    brand: animationSettings?.brand || null,
    announcement: animationSettings?.announcement || null,
    scene: publishedScene,
    runtime: runtimeComponent(config)
  };

  const hashes = Object.fromEntries(Object.entries(components).map(([name, value]) => [name, digest(value)]));
  const revision = digest({ schema_version: PLAYER_STATE_SCHEMA_VERSION, hashes });
  return { schema_version: PLAYER_STATE_SCHEMA_VERSION, revision, hashes, components };
}

export function fullPlayerContext(state) {
  const { components } = state;
  return {
    schema_version: state.schema_version,
    revision: state.revision,
    hashes: state.hashes,
    screen: components.screen,
    draft: components.menu.draft,
    products: components.menu.products,
    packaging: components.menu.packaging,
    animation: components.animation,
    environment: components.environment,
    scene_playlist: components.scene_playlist,
    entity: components.entity,
    brand: components.brand,
    announcement: components.announcement,
    scene: components.scene,
    ...components.runtime
  };
}

export function deltaPlayerContext(state, known = {}) {
  const knownSchema = Number(known?.schema_version);
  const knownHashes = known?.hashes && typeof known.hashes === 'object' && !Array.isArray(known.hashes) ? known.hashes : {};
  if (knownSchema !== PLAYER_STATE_SCHEMA_VERSION) {
    return { full_snapshot_required: true, context: fullPlayerContext(state) };
  }

  const changed = {};
  for (const [name, hash] of Object.entries(state.hashes)) {
    if (knownHashes[name] !== hash) changed[name] = state.components[name];
  }
  return {
    schema_version: state.schema_version,
    revision: state.revision,
    hashes: state.hashes,
    changed,
    unchanged: Object.keys(changed).length === 0
  };
}
