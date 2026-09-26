import crypto from 'node:crypto';
import { menuSettingsInput } from '../contracts/menu-settings.js';
import { buildPlayerContentManifest } from './player-content-manifest-service.js';

export const RENDER_AGENT_PROTOCOL_VERSION = 1;
export const RENDER_TARGET_FPS = 25;
export const RENDER_TARGET_LOOP_MS = 12000;

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
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

function resolution(value) {
  const match = String(value || '').match(/(\d+)\D+(\d+)/);
  return {
    width: Math.max(1, Number(match?.[1]) || 1920),
    height: Math.max(1, Number(match?.[2]) || 1080)
  };
}

function withoutWeather(scene) {
  const source = scene && typeof scene === 'object' && !Array.isArray(scene)
    ? structuredClone(scene)
    : { version: 1, elements: [] };
  source.elements = (Array.isArray(source.elements) ? source.elements : [])
    .filter((element) => !(element?.enabled !== false && element?.type === 'weather'));
  return source;
}

function weatherElements(scene) {
  return (Array.isArray(scene?.elements) ? scene.elements : [])
    .filter((element) => element?.enabled !== false && element?.type === 'weather')
    .map((element) => structuredClone(element));
}

function screenForRender(screen) {
  const viewport = resolution(screen?.resolution);
  return Object.freeze({
    id: Number(screen?.id),
    name: String(screen?.name || ''),
    resolution: String(screen?.resolution || `${viewport.width}x${viewport.height}`),
    width: viewport.width,
    height: viewport.height
  });
}

function signedPayload(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function issueRenderUploadToken(renderPackage, config, ttlSeconds = 900) {
  const payload = {
    v: RENDER_AGENT_PROTOCOL_VERSION,
    screen_id: Number(renderPackage.screen.id),
    render_revision: Number(renderPackage.render_revision),
    input_hash: String(renderPackage.input_hash),
    exp: Math.floor(Date.now() / 1000) + Math.max(60, Math.min(3600, Number(ttlSeconds) || 900))
  };
  return signedPayload(payload, config.sessionSecret);
}

export function verifyRenderUploadToken(token, config) {
  const [encoded, signature, extra] = String(token || '').split('.');
  if (!encoded || !signature || extra) return null;
  const expected = crypto.createHmac('sha256', config.sessionSecret).update(encoded).digest('base64url');
  if (!timingSafeEqualText(signature, expected)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); }
  catch { return null; }
  if (Number(payload?.v) !== RENDER_AGENT_PROTOCOL_VERSION) return null;
  if (!Number.isSafeInteger(Number(payload?.screen_id)) || Number(payload.screen_id) < 1) return null;
  if (!Number.isSafeInteger(Number(payload?.render_revision)) || Number(payload.render_revision) < 1) return null;
  if (!/^[0-9a-f]{64}$/i.test(String(payload?.input_hash || ''))) return null;
  if (!Number.isFinite(Number(payload?.exp)) || Number(payload.exp) < Math.floor(Date.now() / 1000)) return null;
  return Object.freeze({
    screen_id: Number(payload.screen_id),
    render_revision: Number(payload.render_revision),
    input_hash: String(payload.input_hash).toLowerCase(),
    exp: Number(payload.exp)
  });
}

export async function buildRenderAgentPackage(store, screenId, config) {
  const [screen, draft, screenAnimation, globalAnimation, renderRevision] = await Promise.all([
    store.getScreen(screenId),
    store.getScreenDraft(screenId),
    store.getScreenAnimationSettings(screenId),
    store.getAnimationSettings(),
    store.getScreenRenderRevision(screenId)
  ]);
  if (!screen || screen.active === false || !draft) return null;

  const { productIds, packagingIds } = catalogIds(draft);
  const [products, packaging] = await Promise.all([
    store.listProductsByIds(productIds),
    store.listPackagingByIds(packagingIds)
  ]);
  const settings = menuSettingsInput(draft.settings || {}, {
    allowBackgroundImage: true,
    maxWidth: config.screenMaxWidth,
    maxHeight: config.screenMaxHeight
  });
  const animationSettings = screenAnimation || globalAnimation || {};
  const bakedScene = withoutWeather(draft.scene);
  const canonicalDraft = { rows: draft.rows || [], settings };
  const sourceAssets = await buildPlayerContentManifest({
    draft: canonicalDraft,
    scene: bakedScene,
    renderRevision,
    config
  });

  const renderPayload = {
    protocol_version: RENDER_AGENT_PROTOCOL_VERSION,
    renderer_version: String(config.appVersion || ''),
    render_revision: Number(renderRevision) || 1,
    screen: screenForRender(screen),
    draft: canonicalDraft,
    products,
    packaging,
    scene: bakedScene,
    animation: {
      enabled: animationSettings?.enabled === true,
      profile: animationSettings?.profile || null
    },
    scene_playlist: animationSettings?.scene_playlist || null,
    target: {
      container: 'mp4',
      codec: 'h264',
      pixel_format: 'yuv420p',
      fps: RENDER_TARGET_FPS,
      loop_duration_ms: RENDER_TARGET_LOOP_MS,
      audio: false
    },
    source_assets: sourceAssets.assets
  };

  const hashPayload = {
    ...renderPayload,
    screen: {
      name: renderPayload.screen.name,
      resolution: renderPayload.screen.resolution,
      width: renderPayload.screen.width,
      height: renderPayload.screen.height
    }
  };
  const inputHash = digest(hashPayload);
  return Object.freeze({
    ...renderPayload,
    input_hash: inputHash,
    live_overlays: Object.freeze({
      weather: Object.freeze(weatherElements(draft.scene))
    })
  });
}
