import { api } from '../core/api.js';
import { API } from '../core/config.js';

let message;
let scanButton;
let scanner;
let scannerClose;
let scannerCode;
let scannerStatus;
let video;
let scanCanvas;
let codeToggle;
let codePanel;
let codeInput;
let codeButton;
let deviceFound;
let locationStep;
let screenStep;
let locationOptions;
let screenOptions;
let authorizeButton;
let success;
let successText;

function bindDom() {
  message = document.querySelector('#connect-tv-message');
  scanButton = document.querySelector('[data-start-scan]');
  scanner = document.querySelector('[data-scanner]');
  scannerClose = document.querySelector('[data-scanner-close]');
  scannerCode = document.querySelector('[data-scanner-code]');
  scannerStatus = document.querySelector('[data-scanner-status]');
  video = document.querySelector('[data-camera]');
  scanCanvas = document.querySelector('[data-scan-canvas]');
  codeToggle = document.querySelector('[data-code-toggle]');
  codePanel = document.querySelector('[data-code-panel]');
  codeInput = document.querySelector('#connect-tv-code');
  codeButton = document.querySelector('[data-use-code]');
  deviceFound = document.querySelector('[data-device-found]');
  locationStep = document.querySelector('[data-connect-step="location"]');
  screenStep = document.querySelector('[data-connect-step="screen"]');
  locationOptions = document.querySelector('[data-location-options]');
  screenOptions = document.querySelector('[data-screen-options]');
  authorizeButton = document.querySelector('[data-authorize]');
  success = document.querySelector('[data-connect-success]');
  successText = document.querySelector('[data-connect-success-text]');
}

function releaseDom() {
  message = scanButton = scanner = scannerClose = scannerCode = scannerStatus = null;
  video = scanCanvas = codeToggle = codePanel = codeInput = codeButton = null;
  deviceFound = locationStep = screenStep = locationOptions = screenOptions = null;
  authorizeButton = success = successText = null;
}

let activationId = null;
let locations = [];
let screens = [];
let bindings = [];
let selectedLocationId = null;
let selectedScreenId = null;
let mediaStream = null;
let scannerRunning = false;
let scanDetector = null;
let scanFrame = 0;
let lastScanAt = 0;
let jsQrLoadPromise = null;
const JS_QR_SRC = '/vendor/jsQR.js';

function setMessage(text = '', error = false) {
  if (!message) return;
  message.textContent = text;
  message.classList.toggle('is-hidden', !text);
  message.classList.toggle('is-error', Boolean(text && error));
}

function setProgress(step) {
  const order = ['scan', 'location', 'screen'];
  const current = order.indexOf(step);
  document.querySelectorAll('[data-progress-step]').forEach((item) => {
    const index = order.indexOf(item.dataset.progressStep);
    item.classList.toggle('is-active', index === current);
    item.classList.toggle('is-done', index >= 0 && index < current);
  });
}

function focusStep(element, name) {
  setProgress(name);
  if (window.matchMedia('(max-width: 760px)').matches) requestAnimationFrame(() => element?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function stopCamera() {
  scannerRunning = false;
  scanDetector = null;
  lastScanAt = 0;
  if (scanFrame) cancelAnimationFrame(scanFrame);
  scanFrame = 0;
  for (const track of mediaStream?.getTracks?.() || []) track.stop();
  mediaStream = null;
  if (video) { video.pause(); video.srcObject = null; }
  scanner?.classList.add('is-hidden');
  document.documentElement.classList.remove('connect-tv-scanner-open');
}

function resetSelection() {
  activationId = null; selectedLocationId = null; selectedScreenId = null;
  locationStep?.classList.add('is-disabled'); screenStep?.classList.add('is-disabled');
  locationOptions.innerHTML = ''; screenOptions.innerHTML = '';
  authorizeButton.disabled = true; authorizeButton.textContent = 'Подключить ТВ';
  deviceFound?.classList.add('is-hidden'); success?.classList.add('is-hidden'); setProgress('scan');
}

function bindingForScreen(screenId) { return bindings.find((binding) => Number(binding.screen_id) === Number(screenId)) || null; }

function optionButton({ title, subtitle = '', selected = false, occupied = false, onClick }) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = `connect-tv-option${selected ? ' is-selected' : ''}${occupied ? ' is-occupied' : ''}`;
  const strong = document.createElement('strong'); strong.textContent = title; button.append(strong);
  if (subtitle) { const span = document.createElement('span'); span.textContent = subtitle; button.append(span); }
  if (occupied) { const state = document.createElement('em'); state.className = 'connect-tv-option-state'; state.textContent = 'ТВ подключён'; button.append(state); }
  button.addEventListener('click', onClick); return button;
}

function renderScreens() {
  screenOptions.innerHTML = '';
  const available = screens.filter((screen) => Number(screen.location_id) === Number(selectedLocationId) && screen.active !== false);
  if (!available.length) {
    const empty = document.createElement('p'); empty.className = 'connect-tv-empty'; empty.textContent = 'В этой торговой точке нет активных мониторов.';
    screenOptions.append(empty); authorizeButton.disabled = true; return;
  }
  for (const screen of available) {
    const binding = bindingForScreen(screen.id);
    screenOptions.append(optionButton({
      title: screen.name, subtitle: `${screen.resolution || '1920×1080'} · ТВ ${screen.location_number || screen.id}`,
      selected: Number(screen.id) === Number(selectedScreenId), occupied: Boolean(binding),
      onClick: () => { selectedScreenId = Number(screen.id); renderScreens(); authorizeButton.disabled = false; authorizeButton.textContent = binding ? 'Заменить подключённый ТВ' : 'Подключить ТВ'; }
    }));
  }
}

function renderLocations() {
  locationOptions.innerHTML = '';
  for (const location of locations.filter((item) => item.active !== false)) {
    locationOptions.append(optionButton({
      title: location.name, subtitle: location.address || '', selected: Number(location.id) === Number(selectedLocationId),
      onClick: () => {
        selectedLocationId = Number(location.id); selectedScreenId = null; authorizeButton.disabled = true; authorizeButton.textContent = 'Подключить ТВ';
        renderLocations(); screenStep?.classList.remove('is-disabled'); renderScreens(); focusStep(screenStep, 'screen');
      }
    }));
  }
}

async function loadStructure() {
  [locations, screens, bindings] = await Promise.all([api.get(API.locations), api.get(API.screens), api.get(API.deviceBindings)]);
  if (!Array.isArray(bindings)) bindings = [];
}

async function resolveActivation(payload) {
  setMessage('Проверяем телевизор…');
  try {
    const body = payload.scan_payload ? { scan_payload: payload.scan_payload } : { reserve_code: payload.reserve_code };
    const activation = await api.post(API.deviceResolve, body);
    activationId = activation.activation_id;
    await loadStructure();
    deviceFound.textContent = 'Телевизор найден ✓'; deviceFound.classList.remove('is-hidden'); locationStep?.classList.remove('is-disabled');
    setMessage(''); stopCamera(); renderLocations(); focusStep(locationStep, 'location');
  } catch (error) {
    activationId = null; const text = error.message || 'Не удалось проверить код подключения.'; setMessage(text, true);
    if (!scanner?.classList.contains('is-hidden')) scannerStatus.textContent = text;
  }
}

async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats?.();
    if (Array.isArray(formats) && !formats.includes('qr_code')) return null;
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    return async () => {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return '';
      const codes = await detector.detect(video);
      return codes.find((entry) => String(entry.rawValue || '').startsWith('TV2:'))?.rawValue || '';
    };
  } catch { return null; }
}

function jsQrDetector() {
  if (typeof window.jsQR !== 'function' || !scanCanvas) return null;
  const context = scanCanvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  return async () => {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return '';
    const width = video.videoWidth; const height = video.videoHeight;
    if (!width || !height) return '';
    const scale = Math.min(1, 960 / width);
    const canvasWidth = Math.max(1, Math.round(width * scale)); const canvasHeight = Math.max(1, Math.round(height * scale));
    if (scanCanvas.width !== canvasWidth) scanCanvas.width = canvasWidth;
    if (scanCanvas.height !== canvasHeight) scanCanvas.height = canvasHeight;
    context.drawImage(video, 0, 0, canvasWidth, canvasHeight);
    const image = context.getImageData(0, 0, canvasWidth, canvasHeight);
    const result = window.jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
    const value = String(result?.data || '');
    return value.startsWith('TV2:') ? value : '';
  };
}

async function ensureJsQr(timeoutMs = 5000) {
  if (typeof window.jsQR === 'function') return true;
  if (!jsQrLoadPromise) {
    jsQrLoadPromise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = JS_QR_SRC;
      script.async = true;
      script.dataset.miraJsqr = '1';
      script.addEventListener('load', () => resolve(typeof window.jsQR === 'function'), { once: true });
      script.addEventListener('error', () => resolve(false), { once: true });
      document.head.append(script);
    }).finally(() => {
      if (typeof window.jsQR !== 'function') jsQrLoadPromise = null;
    });
  }
  const timeout = new Promise((resolve) => setTimeout(() => resolve(typeof window.jsQR === 'function'), timeoutMs));
  return Boolean(await Promise.race([jsQrLoadPromise, timeout]));
}

async function waitForVideoFrame(timeoutMs = 5000) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight) return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { cleanup(); reject(new Error('video-not-ready')); }, timeoutMs);
    const ready = () => {
      if (!video.videoWidth || !video.videoHeight) return;
      cleanup(); resolve();
    };
    const cleanup = () => { clearTimeout(timeout); video.removeEventListener('loadedmetadata', ready); video.removeEventListener('loadeddata', ready); };
    video.addEventListener('loadedmetadata', ready); video.addEventListener('loadeddata', ready); ready();
  });
}

async function openCamera() {
  const preferred = { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
  try { return await navigator.mediaDevices.getUserMedia(preferred); }
  catch (error) {
    if (!['OverconstrainedError', 'NotFoundError'].includes(error?.name)) throw error;
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

function scannerErrorText(error) {
  if (error?.message === 'decoder-unavailable') return 'QR decoder не загрузился. Локальный jsQR недоступен, а BarcodeDetector не поддерживается браузером.';
  if (error?.message === 'video-not-ready') return 'Камера открыта, но Safari не выдал видеокадр для распознавания.';
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'Доступ к камере запрещён. Разрешите камеру для MIRA-TV в настройках Safari.';
  if (error?.name === 'NotReadableError') return 'Камера занята другим приложением или вкладкой.';
  if (error?.name === 'NotFoundError') return 'Камера на устройстве не найдена.';
  return `QR-сканер не запущен${error?.name ? `: ${error.name}` : ''}.`;
}

async function scanLoop(timestamp = performance.now()) {
  if (!scannerRunning || !scanDetector) return;
  if (timestamp - lastScanAt < 110) {
    scanFrame = requestAnimationFrame((next) => { void scanLoop(next); });
    return;
  }
  lastScanAt = timestamp;
  try {
    const rawValue = await scanDetector();
    if (rawValue) {
      scannerRunning = false; scannerStatus.textContent = 'QR-код найден. Проверяем телевизор…';
      await resolveActivation({ scan_payload: rawValue }); return;
    }
  } catch (error) { console.warn('MIRA-TV QR frame decode failed', error); }
  if (scannerRunning) scanFrame = requestAnimationFrame((next) => { void scanLoop(next); });
}

async function startScanner() {
  setMessage('');
  if (scannerRunning) return;
  if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    setMessage('Камера iPhone/Safari доступна только в HTTPS secure context. Откройте MIRA-TV по HTTPS.', true); return;
  }
  if (!navigator.mediaDevices?.getUserMedia) { setMessage('Этот браузер не предоставляет getUserMedia для камеры.', true); return; }
  scanner?.classList.remove('is-hidden'); document.documentElement.classList.add('connect-tv-scanner-open'); scannerStatus.textContent = 'Запрашиваем доступ к камере…';
  try {
    mediaStream = await openCamera();
    video.srcObject = mediaStream;
    await video.play();
    await waitForVideoFrame();
    scanDetector = await nativeDetector();
    if (!scanDetector && await ensureJsQr()) scanDetector = jsQrDetector();
    if (!scanDetector) throw new Error('decoder-unavailable');
    scannerRunning = true; lastScanAt = 0;
    const settings = mediaStream.getVideoTracks?.()[0]?.getSettings?.() || {};
    scannerStatus.textContent = `Наведите камеру на QR-код · ${video.videoWidth}×${video.videoHeight}${settings.facingMode ? ` · ${settings.facingMode}` : ''}`;
    scanFrame = requestAnimationFrame((next) => { void scanLoop(next); });
  } catch (error) {
    console.error('MIRA-TV QR scanner failed', error);
    const text = scannerErrorText(error);
    stopCamera();
    setMessage(text, true);
  }
}

function normalizeReserveCode() {
  const digits = String(codeInput.value || '').replace(/\D/g, '').slice(0, 6);
  codeInput.value = digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
  return digits;
}

async function sendAuthorization(replaceExisting) { return api.post(API.deviceAuthorize, { activation_id: activationId, screen_id: selectedScreenId, replace_existing: replaceExisting }); }

async function authorize() {
  if (!activationId || !selectedScreenId) return;
  const screen = screens.find((item) => Number(item.id) === Number(selectedScreenId));
  const occupied = Boolean(bindingForScreen(selectedScreenId));
  if (occupied && !window.confirm(`К монитору «${screen?.name || selectedScreenId}» уже подключён ТВ. Отвязать его и подключить этот телевизор?`)) return;
  authorizeButton.disabled = true; setMessage(occupied ? 'Заменяем привязку телевизора…' : 'Подключаем телевизор…');
  try {
    let result;
    try { result = await sendAuthorization(occupied); }
    catch (error) {
      const collision = error?.status === 409 && error?.body?.details?.reason === 'screen_already_bound';
      if (!collision || occupied) throw error;
      if (!window.confirm(`К монитору «${screen?.name || selectedScreenId}» только что подключили другой ТВ. Заменить его?`)) throw error;
      result = await sendAuthorization(true);
    }
    successText.textContent = `${result.screen.location_name} → ${result.screen.name}. ${result.replaces_existing ? 'Предыдущий ТВ будет отвязан. ' : ''}Телевизор автоматически откроет MIRA-TV.`;
    success.classList.remove('is-hidden'); document.querySelector('.connect-tv-flow')?.classList.add('is-hidden'); setMessage(''); activationId = null;
    success.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) { setMessage(error.message || 'Не удалось подключить телевизор.', true); authorizeButton.disabled = false; }
}

export function initialiseConnectTv() {
  bindDom();
  resetSelection();
  void ensureJsQr().catch((error) => console.warn('MIRA-TV local QR decoder preload failed', error));
  scanButton?.addEventListener('click', () => void startScanner());
  scannerClose?.addEventListener('click', stopCamera);
  scannerCode?.addEventListener('click', () => { stopCamera(); codePanel?.classList.remove('is-hidden'); codeInput?.focus(); });
  codeToggle?.addEventListener('click', () => { codePanel?.classList.toggle('is-hidden'); if (!codePanel?.classList.contains('is-hidden')) codeInput?.focus(); });
  codeInput?.addEventListener('input', normalizeReserveCode);
  codeButton?.addEventListener('click', () => { const code = normalizeReserveCode(); if (code.length !== 6) { setMessage('Введите все 6 цифр резервного кода.', true); return; } void resolveActivation({ reserve_code: code }); });
  authorizeButton?.addEventListener('click', () => void authorize());

  const onPageHide = () => stopCamera();
  const onVisibilityChange = () => { if (document.visibilityState === 'hidden') stopCamera(); };
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return {
    dispose() {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stopCamera();
      releaseDom();
    }
  };
}
