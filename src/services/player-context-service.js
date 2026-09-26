import crypto from 'node:crypto';
import { menuSettingsInput } from '../contracts/menu-settings.js';
import { buildPlayerContentManifest } from './player-content-manifest-service.js';

export const PLAYER_STATE_SCHEMA_VERSION = 6;

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

export function playerRuntimeComponent(config, renderRevision = 1, sceneVideoToken = '') {
  return {
    app_version: config.appVersion,
    fallback_poll_interval_ms: config.playerFallbackPollSeconds * 1000,
    log_batch_size: config.playerLogBatchSize,
    log_local_max_entries: config.playerLogLocalMaxEntries,
    log_local_max_bytes: config.playerLogLocalMaxBytes,
    metrics_interval_ms: config.playerMetricsIntervalSeconds * 1000,
    preview_capture_interval_ms: config.tvPreviewCaptureSeconds * 1000,
    preview_max_bytes: config.tvPreviewMaxBytes,
    render_revision: Number(renderRevision) || 1,
    scene_video_revision: String(sceneVideoToken || '')
  };
}

export function playerRuntimeHash(config, renderRevision = 1, sceneVideoToken = '') {
  return digest(playerRuntimeComponent(config, renderRevision, sceneVideoToken));
}

export async function buildPlayerState(store, session, config, { renderRevision = null, sceneVideoService = null } = {}) {
  const [screen, draft, animationSettings] = await Promise.all([
    store.getScreen(session.screen_id),
    store.getScreenDraft(session.screen_id),
    store.getScreenAnimationSettings(session.screen_id)
  ]);
  if (!screen || screen.active === false) return null;

  const currentRenderRevision = Number.isSafeInteger(Number(renderRevision))
    ? Number(renderRevision)
    : await store.getScreenRenderRevision(session.screen_id);
  const { productIds, packagingIds } = catalogIds(draft);
  const [products, packaging] = await Promise.all([
    store.listProductsByIds(productIds),
    store.listPackagingByIds(packagingIds)
  ]);

  const canonicalMenuSettings = menuSettingsInput(draft.settings || {}, {
    allowBackgroundImage: true,
    maxWidth: config.screenMaxWidth,
    maxHeight: config.screenMaxHeight
  });

  const canonicalScene = draft.scene || { version: 1, elements: [] };
  const canonicalDraft = { rows: draft.rows || [], settings: canonicalMenuSettings };
  const screenState = screenComponent(screen);
  const animationState = { enabled: animationSettings?.enabled === true, profile: animationSettings?.profile || null };
  const scenePlaylist = animationSettings?.scene_playlist || null;
  const sceneVideo = sceneVideoService?.componentFor?.({
    screenId: screen.id,
    renderRevision: currentRenderRevision || 1,
    context: {
      screen: screenState,
      draft: canonicalDraft,
      products,
      packaging,
      scene: canonicalScene,
      animation: animationState,
      scene_playlist: scenePlaylist
    }
  }) || { enabled: false, status: 'disabled', source_url: '', live_layers: ['weather'] };

  const contentManifest = await buildPlayerContentManifest({
    draft: canonicalDraft,
    scene: canonicalScene,
    sceneVideo,
    renderRevision: currentRenderRevision || 1,
    config
  });

  const sceneVideoToken = sceneVideoService?.runtimeToken?.(screen.id) || '';
  const components = {
    screen: screenState,
    menu: { draft: canonicalDraft, products, packaging },
    scene: canonicalScene,
    animation: animationState,
    scene_playlist: scenePlaylist,
    scene_video: sceneVideo,
    content_manifest: contentManifest,
    runtime: playerRuntimeComponent(config, currentRenderRevision || 1, sceneVideoToken)
  };

  const hashes = Object.fromEntries(Object.entries(components).map(([name, value]) => [name, digest(value)]));
  const revision = `${PLAYER_STATE_SCHEMA_VERSION}:${currentRenderRevision || 1}`;
  return { schema_version: PLAYER_STATE_SCHEMA_VERSION, revision, render_revision: currentRenderRevision || 1, hashes, components };
}

export function fullPlayerContext(state) {
  const { components } = state;
  return {
    schema_version: state.schema_version,
    revision: state.revision,
    render_revision: state.render_revision,
    hashes: state.hashes,
    screen: components.screen,
    draft: components.menu.draft,
    products: components.menu.products,
    packaging: components.menu.packaging,
    scene: components.scene,
    animation: components.animation,
    scene_playlist: components.scene_playlist,
    scene_video: components.scene_video,
    content_manifest: components.content_manifest,
    ...components.runtime
  };
}

export function deltaPlayerContext(state, known = {}) {
  const knownSchema = Number(known?.schema_version);
  const knownHashes = known?.hashes && typeof known.hashes === 'object' && !Array.isArray(known.hashes) ? known.hashes : {};
  if (knownSchema !== PLAYER_STATE_SCHEMA_VERSION) return { full_snapshot_required: true, context: fullPlayerContext(state) };
  const changed = {};
  for (const [name, hash] of Object.entries(state.hashes)) {
    if (knownHashes[name] !== hash) changed[name] = state.components[name];
  }
  return {
    schema_version: state.schema_version,
    revision: state.revision,
    render_revision: state.render_revision,
    hashes: state.hashes,
    changed,
    unchanged: Object.keys(changed).length === 0
  };
}
