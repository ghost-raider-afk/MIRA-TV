import {
  buildDisplayLines,
  buildRenderLayout,
  buildRenderModel,
  buildTableSvg
} from '../editor/renderer.js';
import { renderSceneEntity } from '../motion/entity-editor.js';
import { renderAnnouncementLayer } from '../motion/announcement.js';
import { renderBrandTitleLayer } from '../motion/brand-title.js';
import { renderEnvironmentLayer } from '../motion/environment.js';
import { ScenePlaylistRuntime } from '../motion/scene-playlist-runtime.js';
import { FlatMenuRenderer, playerMenuRenderMode } from './flat-menu-renderer.js';
import { GpuSceneRuntime } from './gpu-scene-runtime.js';
import { PlayerSceneLayerComposer } from './scene-layer-composer.js';
import { createPlayerStateSync } from './player-state-sync.js';

const ACTIVATION_STORAGE_KEY = 'mira-tv.device-activation.v2';
const LEGACY_ACTIVATION_STORAGE_KEY = 'mira-tv.device-activation';
const DEVICE_KEY_STORAGE_KEY = 'mira-tv.device-key.v1';
const ALL_PLAYER_COMPONENTS = Object.freeze([
  'screen',
  'menu',
  'animation',
  'environment',
  'scene_playlist',
  'entity',
  'brand',
  'announcement',
  'runtime'
]);
const activationView = document.querySelector('[data-activation-view]');
const showActivationButton = document.querySelector('[data-show-activation]');
const pairing = document.querySelector('[data-activation-pairing]');
const qrContainer = document.querySelector('[data-activation-qr]');
const reserveCode = document.querySelector('[data-reserve-code]');
const activationExpiry = document.querySelector('[data-activation-expiry]');
const activationStatus = document.querySelector('[data-activation-status]');
const activationLead = document.querySelector('.activation-lead');
const player = document.querySelector('[data-tv-player]');
const playerStage = document.querySelector('[data-player-stage]');
const playerMessage = document.querySelector('[data-player-message]');
const sceneLayers = new PlayerSceneLayerComposer(playerStage);
const flatMenuRenderer = new FlatMenuRenderer();
const gpuSceneRuntime = new GpuSceneRuntime(playerStage, { composer: sceneLayers });
const scenePlaylistRuntime = new ScenePlaylistRuntime();

let pollTimer = null;
let expiryTimer = null;
let rotationRetryTimer = null;
let wakeLock = null;
let activationRequestInFlight = false;
let bootstrapRetryTimer = null;
let playerStateSync = null;

function setHidden(element, hidden) {
  element?.classList.toggle('is-hidden', hidden);
}

function dispatchPlayerActivity(active) {
  playerStage?.dispatchEvent(new CustomEvent('mira:player-active', { detail: { active: active === true } }));
}

function usableActivation(record) {
  return Boolean(
    record
    && typeof record === 'object'
    && typeof record.activation_id === 'string'
    && typeof record.poll_secret === 'string'
    && typeof record.expires_at === 'string'
    && Date.parse(record.expires_at) > Date.now()
  );
}

function activationFromStorage() {
  try {
    const record = JSON.parse(localStorage.getItem(ACTIVATION_STORAGE_KEY) || 'null');
    if (usableActivation(record)) return record;
  } catch {}

  try {
    const legacy = JSON.parse(sessionStorage.getItem(LEGACY_ACTIVATION_STORAGE_KEY) || 'null');
    if (usableActivation(legacy)) {
      saveActivation(legacy);
      return legacy;
    }
  } catch {}

  clearActivation();
  return null;
}

function saveActivation(record) {
  try { localStorage.setItem(ACTIVATION_STORAGE_KEY, JSON.stringify(record)); } catch {}
  try { sessionStorage.removeItem(LEGACY_ACTIVATION_STORAGE_KEY); } catch {}
}

function clearActivation() {
  try { localStorage.removeItem(ACTIVATION_STORAGE_KEY); } catch {}
  try { sessionStorage.removeItem(LEGACY_ACTIVATION_STORAGE_KEY); } catch {}
}

function currentDeviceKey() {
  try {
    const key = String(localStorage.getItem(DEVICE_KEY_STORAGE_KEY) || '').trim();
    return /^[a-zA-Z0-9_-]{16,128}$/.test(key) ? key : '';
  } catch {
    return '';
  }
}

function rememberDeviceKey(key) {
  const value = String(key || '').trim();
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(value)) return;
  try { localStorage.setItem(DEVICE_KEY_STORAGE_KEY, value); } catch {}
}

function formatReserveCode(value) {
  const code = String(value || '').replace(/\D/g, '').slice(0, 6);
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : '—— ——';
}

function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function clearPairingTimers() {
  if (pollTimer) clearTimeout(pollTimer);
  if (expiryTimer) clearInterval(expiryTimer);
  if (rotationRetryTimer) clearTimeout(rotationRetryTimer);
  pollTimer = null;
  expiryTimer = null;
  rotationRetryTimer = null;
}

function clearBootstrapRetry() {
  if (bootstrapRetryTimer) clearTimeout(bootstrapRetryTimer);
  bootstrapRetryTimer = null;
}

function setActivationLead(text) {
  if (activationLead) activationLead.textContent = text;
}

function invalidatePairing(text = 'Обновляем код подключения…') {
  qrContainer.innerHTML = '';
  reserveCode.textContent = '—— ——';
  if (activationExpiry) activationExpiry.textContent = 'QR обновляется';
  activationStatus.textContent = text;
}

function retryAfterSeconds(response) {
  const raw = Number.parseInt(response?.headers?.get?.('retry-after') || '', 10);
  return Number.isInteger(raw) && raw > 0 ? raw : 5;
}

async function activationRequestError(response) {
  const body = await response.json().catch(() => null);
  const error = new Error(body?.error || `HTTP ${response.status}`);
  error.status = response.status;
  error.retryAfterSeconds = retryAfterSeconds(response);
  return error;
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; }, { once: true });
  } catch {}
}

async function enterImmersiveMode() {
  await requestWakeLock();
  if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
  }
}

function showActivationScreen() {
  playerStateSync?.stop();
  scenePlaylistRuntime.destroy();
  gpuSceneRuntime.destroy();
  flatMenuRenderer.destroy();
  setHidden(player, true);
  dispatchPlayerActivity(false);
  setHidden(activationView, false);
  setHidden(playerMessage, true);
}

function showPairingIntro() {
  clearPairingTimers();
  clearBootstrapRetry();
  showActivationScreen();
  setActivationLead('Этот телевизор ещё не авторизован.');
  showActivationButton.textContent = 'Показать QR-код';
  showActivationButton.disabled = false;
  setHidden(showActivationButton, false);
  setHidden(pairing, true);
}

function keepNeutralBoot() {
  clearPairingTimers();
  clearBootstrapRetry();
  setHidden(activationView, true);
  setHidden(player, true);
  dispatchPlayerActivity(false);
  setHidden(playerMessage, true);
}

function showBootstrapUnavailable(text = 'Связь с сервером временно недоступна. Повторяем проверку…') {
  showActivationScreen();
  setActivationLead(text);
  setHidden(pairing, true);
  setHidden(showActivationButton, true);
}

function scheduleBootstrapRetry(delay = 3000) {
  clearBootstrapRetry();
  bootstrapRetryTimer = setTimeout(() => void bootstrapPlayer(), delay);
}

function startExpiryCountdown(record) {
  if (expiryTimer) clearInterval(expiryTimer);
  let rotationStarted = false;
  const tick = () => {
    const remaining = Date.parse(record.expires_at) - Date.now();
    if (remaining > 0) {
      if (activationExpiry) activationExpiry.textContent = `QR действителен ${formatRemaining(remaining)}`;
      return;
    }
    if (rotationStarted) return;
    rotationStarted = true;
    if (expiryTimer) clearInterval(expiryTimer);
    expiryTimer = null;
    clearActivation();
    invalidatePairing();
    void createActivation({ automatic: true });
  };
  tick();
  if (!rotationStarted) expiryTimer = setInterval(tick, 250);
}

function showPairing(record) {
  clearBootstrapRetry();
  showActivationScreen();
  setActivationLead('Этот телевизор ещё не авторизован.');
  setHidden(showActivationButton, false);
  qrContainer.innerHTML = record.qr_svg;
  reserveCode.textContent = formatReserveCode(record.reserve_code);
  activationStatus.textContent = 'Ожидание авторизации…';
  showActivationButton.textContent = 'Обновить код сейчас';
  setHidden(pairing, false);
  startExpiryCountdown(record);
}

function schedulePoll(record, options = {}) {
  if (pollTimer) clearTimeout(pollTimer);
  const delay = Math.max(1000, Number(record.poll_interval_ms) || 2000);
  pollTimer = setTimeout(() => void pollActivation(record, options), delay);
}

async function pollActivation(record, { revealPending = true } = {}) {
  if (Date.parse(record.expires_at) <= Date.now()) return;
  try {
    const response = await fetch(`/api/device/activations/${encodeURIComponent(record.activation_id)}/status`, {
      headers: { 'x-device-activation-secret': record.poll_secret },
      cache: 'no-store'
    });
    if (response.status === 410 || response.status === 404) {
      clearActivation();
      if (revealPending) invalidatePairing();
      else showBootstrapUnavailable('Код подключения истёк. Создаём новый…');
      await createActivation({ automatic: true });
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (body.status === 'authorized') {
      clearPairingTimers();
      activationStatus.textContent = 'Авторизовано. Запускаем MIRA-TV…';
      const started = await loadPlayer({ fallbackToActivation: false });
      if (started) {
        clearActivation();
        clearBootstrapRetry();
        return;
      }
      showBootstrapUnavailable('Авторизация получена. Завершаем подключение…');
      schedulePoll(record, { revealPending: false });
      return;
    }
    if (!revealPending) showPairing(record);
    else activationStatus.textContent = 'Ожидание авторизации…';
  } catch (error) {
    console.warn('TV activation poll failed', error);
    if (revealPending) {
      activationStatus.textContent = 'Нет связи с сервером. QR действует до окончания таймера.';
    } else {
      showBootstrapUnavailable('Проверяем сохранённое подключение…');
    }
  }
  if (Date.parse(record.expires_at) > Date.now()) schedulePoll(record, { revealPending });
}

async function createActivation({ automatic = false } = {}) {
  if (activationRequestInFlight) return;
  clearBootstrapRetry();
  setActivationLead('Этот телевизор ещё не авторизован.');
  setHidden(showActivationButton, false);
  const previous = activationFromStorage();
  activationRequestInFlight = true;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  if (!automatic) {
    if (expiryTimer) clearInterval(expiryTimer);
    expiryTimer = null;
  }
  showActivationButton.disabled = true;
  activationStatus.textContent = automatic ? 'Обновляем код подключения…' : 'Создаём код подключения…';
  try {
    await enterImmersiveMode();
    const response = await fetch('/api/device/activations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device_key: currentDeviceKey() || undefined }),
      cache: 'no-store'
    });
    if (!response.ok) throw await activationRequestError(response);
    const record = await response.json();
    rememberDeviceKey(record.device_key);
    clearPairingTimers();
    saveActivation(record);
    showPairing(record);
    schedulePoll(record);
  } catch (error) {
    console.error('TV activation could not start', error);
    if (usableActivation(previous)) {
      showPairing(previous);
      schedulePoll(previous);
      if (error?.status === 429) {
        activationStatus.textContent = `Код обновлялся слишком часто. Текущий QR продолжает работать. Новый код можно запросить через ${error.retryAfterSeconds || 5} с.`;
      } else {
        activationStatus.textContent = 'Не удалось обновить QR. Текущий код продолжает работать и остаётся связан с сервером.';
      }
      return;
    }

    showActivationScreen();
    setHidden(showActivationButton, false);
    setHidden(pairing, false);
    if (error?.status === 429) {
      const delay = Math.max(1, Number(error.retryAfterSeconds) || 5);
      invalidatePairing(`Слишком много запросов на обновление QR. Повтор через ${delay} с.`);
      rotationRetryTimer = setTimeout(() => void createActivation({ automatic: true }), delay * 1000);
    } else {
      invalidatePairing('Связь с сервером временно недоступна. Новый QR появится автоматически после восстановления связи.');
      rotationRetryTimer = setTimeout(() => void createActivation({ automatic: true }), 5000);
    }
  } finally {
    activationRequestInFlight = false;
    showActivationButton.disabled = false;
  }
}

function resolutionOf(screen) {
  const match = String(screen?.resolution || '').match(/(\d+)\D+(\d+)/);
  return { width: Number(match?.[1]) || 1920, height: Number(match?.[2]) || 1080 };
}

function sameOriginAsset(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text, window.location.origin);
    return url.origin === window.location.origin ? url.href : '';
  } catch {
    return '';
  }
}

async function warmPlayerAssetCache(context, changedNames = ALL_PLAYER_COMPONENTS) {
  const dirty = new Set(changedNames);
  const assets = [];
  if (dirty.has('menu') || dirty.has('screen')) {
    const background = sameOriginAsset(context?.draft?.settings?.background_image_url);
    if (background) assets.push(background);
  }
  if (dirty.has('entity')) {
    const entity = sameOriginAsset(context?.entity?.asset_url);
    if (entity) assets.push(entity);
  }
  await Promise.all(
    [...new Set(assets)].map((asset) => fetch(asset, {
      cache: 'force-cache',
      credentials: 'same-origin'
    }).catch(() => undefined))
  );
}

async function renderPlayerContext(context, changedNames = ALL_PLAYER_COMPONENTS) {
  const dirty = new Set(changedNames?.length ? changedNames : ALL_PLAYER_COMPONENTS);
  const {
    environment: environmentLayer,
    menu: menuLayer,
    fx: fxLayer,
    content: contentLayer,
    entity: entityLayer,
    brand: brandLayer,
    announcement: announcementLayer
  } = sceneLayers.ensureCore();

  const menuDirty = dirty.has('menu') || dirty.has('screen');
  const gpuDirty = menuDirty || dirty.has('animation');
  const playlistDirty = dirty.has('scene_playlist') || dirty.has('entity') || dirty.has('screen');
  let viewport = null;
  let model = null;
  let renderMode = null;

  if (menuDirty || gpuDirty) {
    viewport = resolutionOf(context.screen);
    model = buildRenderModel(context.draft, viewport);
    renderMode = playerMenuRenderMode(context);
  }

  if (menuDirty) {
    const lines = buildDisplayLines(model, {
      products: context.products || [],
      packaging: context.packaging || [],
      fallbackTitle: context.screen?.name || 'Меню'
    });
    const layout = buildRenderLayout(model, lines);
    const menuSvg = buildTableSvg(model, lines, layout);
    menuLayer.dataset.renderMode = renderMode;
    try {
      await flatMenuRenderer.render(menuLayer, menuSvg, viewport);
    } catch (error) {
      console.error('Flat MIRA-TV render failed; using static DOM fallback', error);
      flatMenuRenderer.destroy();
      menuLayer.innerHTML = menuSvg;
      menuLayer.dataset.renderMode = 'dom-fallback';
      gpuSceneRuntime.destroy();
    }

    playerStage.style.backgroundColor = model.settings.background_color || '#101828';
    const background = sameOriginAsset(model.settings.background_image_url);
    playerStage.style.backgroundImage = background ? `url(${JSON.stringify(background)})` : 'none';
  } else if (dirty.has('animation')) {
    menuLayer.dataset.renderMode = renderMode;
  }

  if (dirty.has('environment')) {
    renderEnvironmentLayer(environmentLayer, context.environment, { allowIntro: true });
  }
  if (dirty.has('entity')) {
    renderSceneEntity(playerStage, context.entity, { editable: false });
    playerStage.dispatchEvent(new CustomEvent('mira:entity-rendered'));
  }
  if (dirty.has('brand')) {
    renderBrandTitleLayer(brandLayer, context.brand);
  }
  if (dirty.has('announcement')) {
    renderAnnouncementLayer(announcementLayer, context.announcement);
  }
  if (gpuDirty) {
    gpuSceneRuntime.render({
      enabled: renderMode === 'flat-gpu',
      profile: context.animation?.profile,
      viewport,
      settings: model.settings
    });
  }
  if (playlistDirty) {
    scenePlaylistRuntime.render(context.scene_playlist, {
      menuLayer,
      contentLayer,
      fxLayer,
      entity: context.entity,
      autoplay: true
    });
  }
  entityLayer.setAttribute('aria-hidden', 'true');
}

function showConnectionMessage(message) {
  if (!message) {
    setHidden(playerMessage, true);
    playerMessage.textContent = '';
    return;
  }
  playerMessage.textContent = message;
  setHidden(playerMessage, false);
}

async function applySyncedContext(context, changedNames, { source } = {}) {
  clearPairingTimers();
  await renderPlayerContext(context, changedNames);
  setHidden(activationView, true);
  setHidden(player, false);
  dispatchPlayerActivity(true);
  if (source === 'last-known-good') {
    showConnectionMessage('ТВ запущен по последнему рабочему состоянию. Проверяем связь с сервером…');
  }
  await requestWakeLock();
}

function playerConnectivityChanged(state) {
  if (state === 'online') {
    showConnectionMessage('');
    return;
  }
  if (!playerStateSync?.hasContext) return;
  if (state === 'offline') {
    showConnectionMessage('Нет связи с сервером. ТВ продолжает работать по последнему рабочему состоянию.');
  } else if (state === 'degraded') {
    showConnectionMessage('Связь с сервером нестабильна. Текущий экран продолжает работать локально.');
  }
}

function playerUnauthorized() {
  clearActivation();
  showPairingIntro();
}

async function fetchDeviceSession(timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/api/device/session', { cache: 'no-store', signal: controller.signal });
    if (response.status === 401 || response.status === 403) return { unauthorized: true };
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { session: await response.json().catch(() => null) };
  } finally {
    clearTimeout(timer);
  }
}

async function loadPlayer({ fallbackToActivation = true } = {}) {
  clearPairingTimers();
  const result = await playerStateSync.syncNow('boot');
  if (result.unauthorized) {
    if (fallbackToActivation) showPairingIntro();
    return false;
  }
  if (result.hasContext || playerStateSync.hasContext) {
    playerStateSync.start();
    await requestWakeLock();
    return true;
  }
  if (fallbackToActivation) showPairingIntro();
  return false;
}

async function registerOfflinePlayer() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/player-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
  } catch (error) {
    console.warn('Offline TV player service worker could not start', error);
  }
}

async function bootstrapPlayer() {
  clearBootstrapRetry();
  try {
    const result = await fetchDeviceSession();
    if (!result.unauthorized) {
      rememberDeviceKey(result.session?.device_key);
      const started = await loadPlayer({ fallbackToActivation: false });
      if (started) {
        clearActivation();
        return;
      }
      const pending = activationFromStorage();
      if (pending) {
        rememberDeviceKey(pending.device_key);
        showBootstrapUnavailable('Завершаем авторизацию телевизора…');
        await pollActivation(pending, { revealPending: false });
        return;
      }
      showBootstrapUnavailable('Проверяем привязку телевизора…');
      scheduleBootstrapRetry();
      return;
    }

    await playerStateSync.reset();
  } catch (error) {
    console.warn('TV session bootstrap failed', error);
    if (playerStateSync.hasContext) {
      playerStateSync.start();
      return;
    }
    const pending = activationFromStorage();
    if (pending) {
      rememberDeviceKey(pending.device_key);
      keepNeutralBoot();
      await pollActivation(pending, { revealPending: false });
      return;
    }
    showBootstrapUnavailable();
    scheduleBootstrapRetry();
    return;
  }

  const pending = activationFromStorage();
  if (pending) {
    rememberDeviceKey(pending.device_key);
    keepNeutralBoot();
    await pollActivation(pending, { revealPending: false });
    return;
  }
  showPairingIntro();
}

async function initialisePlayer() {
  playerStateSync = createPlayerStateSync({
    applyContext: applySyncedContext,
    warmAssets: warmPlayerAssetCache,
    onUnauthorized: playerUnauthorized,
    onConnectivity: playerConnectivityChanged
  });

  showActivationButton.addEventListener('click', () => void createActivation());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void requestWakeLock();
  });
  void navigator.storage?.persist?.().catch(() => undefined);
  void registerOfflinePlayer();

  const restored = await playerStateSync.restoreLastKnownGood();
  playerStateSync.note('player.boot', { restored });
  await bootstrapPlayer();
}

void initialisePlayer();
