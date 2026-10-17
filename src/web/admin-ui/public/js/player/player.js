import { createPlayerStateSync } from './player-state-sync.js';
import { ALL_PLAYER_COMPONENTS, PlayerSceneRenderer } from './player-scene-renderer.js';
import { fetchWithTimeout } from './fetch-timeout.js';

window.__miraPlayerModuleStarted = true;

const ACTIVATION_STORAGE_KEY = 'mira-tv.device-activation.v2';
const LEGACY_ACTIVATION_STORAGE_KEY = 'mira-tv.device-activation';
const DEVICE_KEY_STORAGE_KEY = 'mira-tv.device-key.v1';
const PLAYER_BUILD_VERSION = '1.18.15';
const PLAYER_RELOAD_VERSION_KEY = 'mira-tv.player-reload-version.v1';
const PLAYER_BUILD_RETRY_MIN_MS = 15_000;
const PLAYER_BUILD_RETRY_MAX_MS = 300_000;
const activationView = document.querySelector('[data-activation-view]');
const showActivationButton = document.querySelector('[data-show-activation]');
const pairing = document.querySelector('[data-activation-pairing]');
const qrContainer = document.querySelector('[data-activation-qr]');
const reserveCode = document.querySelector('[data-reserve-code]');
const activationExpiry = document.querySelector('[data-activation-expiry]');
const activationStatus = document.querySelector('[data-activation-status]');
const activationLead = document.querySelector('.activation-lead');
const installPlayerButton = document.querySelector('[data-install-player]');
const installPlayerHint = document.querySelector('[data-install-player-hint]');
const player = document.querySelector('[data-tv-player]');
const playerStage = document.querySelector('[data-player-stage]');
const playerMessage = document.querySelector('[data-player-message]');
const playerSceneRenderer = new PlayerSceneRenderer(playerStage);

let pollTimer = null;
let expiryTimer = null;
let rotationRetryTimer = null;
let wakeLock = null;
let activationRequestInFlight = false;
let bootstrapRetryTimer = null;
let playerStateSync = null;
let offlinePlayerRegistrationPromise = null;
let playerBuildUpdatePromise = null;
let playerBuildRetryTimer = null;
let playerBuildRetryDelayMs = PLAYER_BUILD_RETRY_MIN_MS;
let playerBuildRetryVersion = '';
let serviceWorkerControllerChanged = false;
let backgroundServices = null;
let backgroundServicesPromise = null;
let playerInstallPrompt = null;
let firstPlayerFramePresented = false;
let firstFrameWorkScheduled = false;
let pendingPostFrameWork = null;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    serviceWorkerControllerChanged = true;
  });
}

function setHidden(element, hidden) {
  element?.classList.toggle('is-hidden', hidden);
}

function finishPlayerBoot() {
  window.__miraPlayerBootReady = true;
  document.documentElement.classList.add('player-boot-ready');
}

function setMessage(text, isError = false) {
  if (!playerMessage) return;
  playerMessage.textContent = text;
  playerMessage.classList.toggle('is-error', isError);
}

function showPlayer(active) {
  player?.classList.toggle('is-hidden', !active);
  activationView?.classList.toggle('is-hidden', active);
}

function startActivationExpiry(expiresAt) {
  clearInterval(expiryTimer);
  const tick = () => {
    const remainingMs = new Date(expiresAt).getTime() - Date.now();
    if (remainingMs <= 0) {
      activationExpiry.textContent = 'Код истёк';
      clearInterval(expiryTimer);
      return;
    }
    activationExpiry.textContent = `Действует ещё ${Math.ceil(remainingMs / 1000)} сек.`;
  };
  tick();
  expiryTimer = setInterval(tick, 1000);
}

function loadActivationRecord() {
  try {
    const current = JSON.parse(localStorage.getItem(ACTIVATION_STORAGE_KEY) || 'null');
    if (current?.activation_id && current?.poll_secret) return current;
    const legacy = JSON.parse(localStorage.getItem(LEGACY_ACTIVATION_STORAGE_KEY) || 'null');
    if (legacy?.activation_id && legacy?.poll_secret) {
      localStorage.setItem(ACTIVATION_STORAGE_KEY, JSON.stringify(legacy));
      localStorage.removeItem(LEGACY_ACTIVATION_STORAGE_KEY);
      return legacy;
    }
  } catch {
    // Ignore malformed local activation state.
  }
  return null;
}

function saveActivationRecord(record) {
  localStorage.setItem(ACTIVATION_STORAGE_KEY, JSON.stringify(record));
  localStorage.removeItem(LEGACY_ACTIVATION_STORAGE_KEY);
}

function clearActivationRecord() {
  localStorage.removeItem(ACTIVATION_STORAGE_KEY);
  localStorage.removeItem(LEGACY_ACTIVATION_STORAGE_KEY);
}

function loadDeviceKey() {
  return localStorage.getItem(DEVICE_KEY_STORAGE_KEY) || '';
}

function saveDeviceKey(value) {
  const key = String(value || '').trim();
  if (!key) return;
  localStorage.setItem(DEVICE_KEY_STORAGE_KEY, key);
}

function clearDeviceKey() {
  localStorage.removeItem(DEVICE_KEY_STORAGE_KEY);
}

function storedReloadVersion() {
  return sessionStorage.getItem(PLAYER_RELOAD_VERSION_KEY) || '';
}

function rememberReloadVersion(version) {
  sessionStorage.setItem(PLAYER_RELOAD_VERSION_KEY, version);
}

function clearReloadVersion() {
  sessionStorage.removeItem(PLAYER_RELOAD_VERSION_KEY);
}

function clearPlayerBuildRetry() {
  clearTimeout(playerBuildRetryTimer);
  playerBuildRetryTimer = null;
  playerBuildRetryVersion = '';
  playerBuildRetryDelayMs = PLAYER_BUILD_RETRY_MIN_MS;
}

function schedulePlayerBuildRetry(version) {
  const normalizedVersion = String(version || '').trim();
  if (!normalizedVersion || normalizedVersion === PLAYER_BUILD_VERSION) {
    clearPlayerBuildRetry();
    return;
  }
  if (playerBuildRetryTimer && playerBuildRetryVersion === normalizedVersion) return;
  clearTimeout(playerBuildRetryTimer);
  playerBuildRetryVersion = normalizedVersion;
  const delay = playerBuildRetryDelayMs;
  playerBuildRetryTimer = setTimeout(() => {
    playerBuildRetryTimer = null;
    void updatePlayerBuild(normalizedVersion);
  }, delay);
  playerBuildRetryDelayMs = Math.min(PLAYER_BUILD_RETRY_MAX_MS, delay * 2);
}

async function updatePlayerBuild(serverVersion) {
  if (!('serviceWorker' in navigator)) return false;
  if (playerBuildUpdatePromise) return playerBuildUpdatePromise;
  playerBuildUpdatePromise = (async () => {
    try {
      const registration = await navigator.serviceWorker.getRegistration('/player');
      if (!registration) return false;
      await registration.update();
      const worker = registration.waiting || registration.installing;
      if (worker) worker.postMessage({ type:'mira.player.activate' });
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type:'mira.player.activate' });
      }
      rememberReloadVersion(serverVersion);
      if (serviceWorkerControllerChanged) {
        window.location.reload();
        return true;
      }
      const changed = await new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        const timer = setTimeout(() => finish(false), 4_000);
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          clearTimeout(timer);
          finish(true);
        }, { once:true });
      });
      if (changed) {
        window.location.reload();
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      playerBuildUpdatePromise = null;
    }
  })();
  return playerBuildUpdatePromise;
}

function reconcilePlayerBuild(state, changedNames) {
  if (!changedNames?.includes('runtime')) return;
  const serverVersion = String(state?.runtime?.app_version || '').trim();
  if (!serverVersion) return;
  if (serverVersion === PLAYER_BUILD_VERSION) {
    clearPlayerBuildRetry();
    clearReloadVersion();
    return;
  }
  if (storedReloadVersion() === serverVersion) {
    schedulePlayerBuildRetry(serverVersion);
    return;
  }
  void updatePlayerBuild(serverVersion).then((updated) => {
    if (!updated) schedulePlayerBuildRetry(serverVersion);
  });
}

async function bootstrapPlayer() {
  if (!playerStateSync) return false;
  try {
    const result = await playerStateSync.refresh(ALL_PLAYER_COMPONENTS, 'bootstrap');
    if (result?.state) {
      showPlayer(true);
      return true;
    }
  } catch {
    // LKG remains visible while bootstrap retries.
  }
  return false;
}

function scheduleBootstrapRetry() {
  clearTimeout(bootstrapRetryTimer);
  bootstrapRetryTimer = setTimeout(() => {
    bootstrapRetryTimer = null;
    void bootstrapPlayer().then((active) => {
      if (!active) scheduleBootstrapRetry();
    });
  }, 5_000);
}

function stopActivationPolling() {
  clearTimeout(pollTimer);
  pollTimer = null;
}

async function fetchActivationStatus(record) {
  const response = await fetchWithTimeout(`/api/device/activation/${encodeURIComponent(record.activation_id)}/status`, {
    headers: { 'X-Activation-Poll-Secret':record.poll_secret }
  }, 8_000);
  if (response.status === 404 || response.status === 410) {
    clearActivationRecord();
    return { expired:true };
  }
  if (!response.ok) throw new Error('Не удалось проверить подключение ТВ');
  return response.json();
}

async function finishActivation(record, status) {
  stopActivationPolling();
  saveDeviceKey(status.device_key);
  const response = await fetchWithTimeout('/api/device/session', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ activation_id:record.activation_id, device_key:status.device_key })
  }, 8_000);
  if (!response.ok) throw new Error('Не удалось завершить подключение ТВ');
  clearActivationRecord();
  window.location.replace('/player');
}

async function pollActivation(record) {
  stopActivationPolling();
  try {
    const status = await fetchActivationStatus(record);
    if (status.expired) {
      setMessage('Код подключения истёк. Создайте новый.', true);
      return;
    }
    if (status.status === 'approved' && status.device_key) {
      await finishActivation(record, status);
      return;
    }
    if (status.status === 'rejected') {
      clearActivationRecord();
      setMessage('Подключение отклонено администратором.', true);
      return;
    }
    pollTimer = setTimeout(() => void pollActivation(record), 2_000);
  } catch {
    setMessage('Нет связи с сервером. Повторяем попытку…', true);
    pollTimer = setTimeout(() => void pollActivation(record), 5_000);
  }
}

function renderActivation(record) {
  showPlayer(false);
  pairing?.classList.remove('is-hidden');
  if (qrContainer) {
    qrContainer.replaceChildren();
    const img = document.createElement('img');
    img.src = record.qr_data_url;
    img.alt = 'QR-код подключения';
    qrContainer.append(img);
  }
  if (reserveCode) reserveCode.textContent = record.reserve_code || '';
  startActivationExpiry(record.expires_at);
  void pollActivation(record);
}

async function createActivation() {
  if (activationRequestInFlight) return;
  activationRequestInFlight = true;
  setMessage('Создаём код подключения…');
  try {
    const response = await fetchWithTimeout('/api/device/activation', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ device_key:loadDeviceKey() || null })
    }, 8_000);
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('Retry-After')) || 5;
      setMessage(`Слишком много попыток. Повторите через ${retryAfter} сек.`, true);
      return;
    }
    if (!response.ok) throw new Error('Не удалось создать подключение ТВ');
    const record = await response.json();
    saveActivationRecord(record);
    renderActivation(record);
  } catch {
    setMessage('Не удалось получить код подключения. Проверьте сеть.', true);
  } finally {
    activationRequestInFlight = false;
  }
}

async function checkDeviceSession() {
  try {
    const response = await fetchWithTimeout('/api/device/session', {}, 8_000);
    if (response.ok) {
      const payload = await response.json();
      if (payload.device_key) saveDeviceKey(payload.device_key);
      return true;
    }
    if (response.status === 401 || response.status === 403) return false;
    return null;
  } catch {
    return null;
  }
}

async function registerOfflinePlayer() {
  if (!('serviceWorker' in navigator)) return null;
  if (!offlinePlayerRegistrationPromise) {
    offlinePlayerRegistrationPromise = navigator.serviceWorker.register('/player-sw.js', { scope:'/player' })
      .then(async (registration) => {
        await registration.update();
        return registration;
      })
      .catch(() => null);
  }
  return offlinePlayerRegistrationPromise;
}

async function ensurePlayerStateSync() {
  if (playerStateSync) return playerStateSync;
  playerStateSync = createPlayerStateSync({
    renderer:playerSceneRenderer,
    onStateApplied: ({ state, changedNames }) => {
      reconcilePlayerBuild(state, changedNames);
      showPlayer(true);
      if (!firstPlayerFramePresented) {
        firstPlayerFramePresented = true;
        window.dispatchEvent(new CustomEvent('mira:player-active'));
        if (!firstFrameWorkScheduled) {
          firstFrameWorkScheduled = true;
          pendingPostFrameWork = setTimeout(() => {
            pendingPostFrameWork = null;
            void ensureBackgroundServices();
          }, 0);
        }
      }
    }
  });
  return playerStateSync;
}

async function ensureBackgroundServices() {
  if (backgroundServices) return backgroundServices;
  if (backgroundServicesPromise) return backgroundServicesPromise;
  backgroundServicesPromise = import('./player-background-services.js')
    .then(({ createPlayerBackgroundServices }) => {
      backgroundServices = createPlayerBackgroundServices({ playerStateSync });
      backgroundServices.start();
      return backgroundServices;
    })
    .catch(() => null)
    .finally(() => { backgroundServicesPromise = null; });
  return backgroundServicesPromise;
}

async function initialisePlayer() {
  window.__miraPlayerBootReady = false;
  void registerOfflinePlayer();
  await ensurePlayerStateSync();
  const restored = await playerStateSync.restoreLastKnownGood();
  playerStateSync.note('player.boot', { restored, build:PLAYER_BUILD_VERSION });
  if (restored) showPlayer(true);
  finishPlayerBoot();

  const session = await checkDeviceSession();
  if (session === true) {
    if (!await bootstrapPlayer()) scheduleBootstrapRetry();
    return;
  }
  if (session === null && restored) {
    scheduleBootstrapRetry();
    return;
  }

  const activation = loadActivationRecord();
  if (activation) {
    renderActivation(activation);
    return;
  }
  showPlayer(false);
  showActivationButton?.classList.remove('is-hidden');
  setMessage('ТВ не подключён. Нажмите OK, чтобы получить код подключения.');
}

showActivationButton?.addEventListener('click', () => void createActivation());
showActivationButton?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    void createActivation();
  }
});

window.addEventListener('beforeunload', () => {
  clearTimeout(expiryTimer);
  clearTimeout(rotationRetryTimer);
  clearTimeout(bootstrapRetryTimer);
  clearTimeout(playerBuildRetryTimer);
  clearTimeout(pendingPostFrameWork);
  stopActivationPolling();
  backgroundServices?.stop();
});

void initialisePlayer();
