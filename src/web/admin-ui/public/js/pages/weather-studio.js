import { api } from '../core/api.js';
import { setMessage, setPending } from '../core/dom.js';
import { normaliseWeatherWidget, renderWeatherWidget, WEATHER_SAMPLE, WEATHER_SCENE_HEIGHT, WEATHER_SCENE_WIDTH } from '../motion/weather-widget.js';

const ENDPOINTS = Object.freeze({
  settings: '/api/weather/settings',
  screen: (screenId) => `/api/weather/screens/${screenId}`,
  locations: '/api/weather/locations',
  preview: '/api/weather/preview'
});

const POSITION_PRESETS = Object.freeze({
  'top-left': Object.freeze({ x: 240, y: 170, position: 'top-left' }),
  top: Object.freeze({ x: 960, y: 170, position: 'top-right' }),
  'top-right': Object.freeze({ x: 1680, y: 170, position: 'top-right' }),
  left: Object.freeze({ x: 240, y: 540, position: 'top-left' }),
  center: Object.freeze({ x: 960, y: 540, position: 'top-right' }),
  right: Object.freeze({ x: 1680, y: 540, position: 'top-right' }),
  'bottom-left': Object.freeze({ x: 240, y: 910, position: 'bottom-left' }),
  bottom: Object.freeze({ x: 960, y: 910, position: 'bottom-right' }),
  'bottom-right': Object.freeze({ x: 1680, y: 910, position: 'bottom-right' })
});

let current = normaliseWeatherWidget();
let snapshot = WEATHER_SAMPLE;
let disposed = false;
let observer = null;
let resizeObserver = null;
let previewTimer = null;
let dragging = null;
let selectedScreenId = null;
let screenSelectionListener = null;

function node(id) { return document.getElementById(id); }
function checked(id) { return node(id)?.checked === true; }
function value(id) { return node(id)?.value ?? ''; }
function number(id) { return Number(value(id)); }
function optionalNumber(id) { const raw = value(id); return raw === '' ? null : Number(raw); }
function setValue(id, next) { const target = node(id); if (target) target.value = next === null || next === undefined ? '' : String(next); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }

function markApplicationDirty() {
  window.dispatchEvent(new CustomEvent('mira:animation-studio-dirty', { detail: { source: 'weather' } }));
}

function weatherSceneMetrics(stage) {
  const rect = stage.getBoundingClientRect();
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  const scale = Math.min(width / WEATHER_SCENE_WIDTH, height / WEATHER_SCENE_HEIGHT);
  const sceneScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    rect,
    originX: rect.left + stage.clientLeft,
    originY: rect.top + stage.clientTop,
    scale: sceneScale,
    offsetX: Math.max(0, (width - (WEATHER_SCENE_WIDTH * sceneScale)) / 2),
    offsetY: Math.max(0, (height - (WEATHER_SCENE_HEIGHT * sceneScale)) / 2)
  };
}

function applyWeatherSceneScale(stage, layer) {
  const metrics = weatherSceneMetrics(stage);
  layer.dataset.weatherSceneScale = String(metrics.scale);
  layer.style.inset = 'auto';
  layer.style.left = `${metrics.offsetX}px`;
  layer.style.top = `${metrics.offsetY}px`;
  layer.style.width = `${WEATHER_SCENE_WIDTH}px`;
  layer.style.height = `${WEATHER_SCENE_HEIGHT}px`;
  layer.style.transformOrigin = 'top left';
  layer.style.transform = `scale(${metrics.scale})`;
  return metrics;
}

function ensureLayer() {
  const stage = node('animation-stage');
  if (!(stage instanceof HTMLElement)) return null;
  let layer = stage.querySelector('[data-weather-layer]');
  if (!(layer instanceof HTMLElement)) {
    layer = document.createElement('div');
    layer.setAttribute('data-weather-layer', '');
    stage.append(layer);
  }
  applyWeatherSceneScale(stage, layer);
  layer.dataset.weatherEditor = 'true';
  renderWeatherWidget(layer, current, snapshot);
  return layer;
}

function formSettings() {
  if (!node('weather-enabled')) return normaliseWeatherWidget(current);
  return normaliseWeatherWidget({
    enabled: checked('weather-enabled'),
    location_name: value('weather-location-name'),
    latitude: optionalNumber('weather-latitude'),
    longitude: optionalNumber('weather-longitude'),
    timezone: value('weather-timezone') || 'auto',
    position: value('weather-position') || current.position,
    x: number('weather-x'),
    y: number('weather-y'),
    scale: number('weather-scale'),
    refresh_minutes: number('weather-refresh'),
    width_px: number('weather-width'),
    opacity: number('weather-opacity'),
    animation_enabled: checked('weather-animation-enabled'),
    animation_speed: number('weather-animation-speed'),
    animation_intensity: number('weather-animation-intensity'),
    widget_motion_enabled: checked('weather-widget-motion-enabled'),
    show_condition: checked('weather-show-condition'),
    show_feels_like: checked('weather-show-feels'),
    show_humidity: checked('weather-show-humidity'),
    show_wind: checked('weather-show-wind'),
    show_forecast: checked('weather-show-forecast'),
    forecast_items: number('weather-forecast-items')
  });
}

function syncOutputs(settings = current) {
  const scaleOutput = node('weather-scale-output');
  if (scaleOutput) scaleOutput.textContent = `${settings.scale.toFixed(2)}×`;
  const widthOutput = node('weather-width-output');
  if (widthOutput) widthOutput.textContent = `${Math.round(settings.width_px)} px`;
  const opacityOutput = node('weather-opacity-output');
  if (opacityOutput) opacityOutput.textContent = `${Math.round(settings.opacity * 100)}%`;
  const speedOutput = node('weather-animation-speed-output');
  if (speedOutput) speedOutput.textContent = `${settings.animation_speed.toFixed(2)}×`;
  const intensityOutput = node('weather-animation-intensity-output');
  if (intensityOutput) intensityOutput.textContent = `${Math.round(settings.animation_intensity * 100)}%`;
  const motion = node('weather-motion-settings');
  if (motion) motion.dataset.weatherMotionDisabled = settings.animation_enabled ? 'false' : 'true';
  for (const id of ['weather-animation-speed', 'weather-animation-intensity', 'weather-widget-motion-enabled']) {
    const control = node(id);
    if (control instanceof HTMLInputElement) control.disabled = !settings.animation_enabled;
  }
}

function sync(settings = current) {
  current = normaliseWeatherWidget(settings);
  const enabled = node('weather-enabled'); if (enabled) enabled.checked = current.enabled;
  const animationEnabled = node('weather-animation-enabled'); if (animationEnabled) animationEnabled.checked = current.animation_enabled;
  const widgetMotion = node('weather-widget-motion-enabled'); if (widgetMotion) widgetMotion.checked = current.widget_motion_enabled;
  setValue('weather-location-name', current.location_name);
  setValue('weather-latitude', current.latitude);
  setValue('weather-longitude', current.longitude);
  setValue('weather-timezone', current.timezone);
  setValue('weather-position', current.position);
  setValue('weather-x', Math.round(current.x));
  setValue('weather-y', Math.round(current.y));
  setValue('weather-scale', current.scale);
  setValue('weather-refresh', current.refresh_minutes);
  setValue('weather-width', current.width_px);
  setValue('weather-opacity', current.opacity);
  setValue('weather-animation-speed', current.animation_speed);
  setValue('weather-animation-intensity', current.animation_intensity);
  setValue('weather-forecast-items', current.forecast_items);
  for (const [id, state] of Object.entries({
    'weather-show-condition': current.show_condition,
    'weather-show-feels': current.show_feels_like,
    'weather-show-humidity': current.show_humidity,
    'weather-show-wind': current.show_wind,
    'weather-show-forecast': current.show_forecast
  })) { const input = node(id); if (input) input.checked = state; }
  syncOutputs(current);
  ensureLayer();
}

export function weatherStudioSettings() {
  current = formSettings();
  return { ...current };
}

export function applyWeatherStudioSettings(settings) {
  current = normaliseWeatherWidget(settings);
  sync(current);
  return { ...current };
}

export async function loadWeatherForScreen(screenId, { silent = true } = {}) {
  const id = Number(screenId);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  selectedScreenId = id;
  try {
    const saved = await api.get(ENDPOINTS.screen(id));
    if (disposed || selectedScreenId !== id) return null;
    current = normaliseWeatherWidget(saved);
    sync(current);
    const status = node('weather-location-status');
    if (status) status.textContent = current.location_name || 'На выбранном мониторе погода не настроена.';
    if (Number.isFinite(current.latitude) && Number.isFinite(current.longitude)) await previewWeather();
    if (!silent) setMessage('animation-message', 'Настройки погоды выбранного монитора загружены.', 'info');
    return { ...current };
  } catch (error) {
    if (!silent && !disposed) setMessage('animation-message', error.message);
    return null;
  }
}

function cardMarkup() {
  return `<section class="settings-card weather-settings-card" aria-label="Виджет погоды">
    <div class="card-heading"><div><p class="eyebrow">WEATHER</p><h2>Погода</h2><p>Погода и её анимация применяются вместе со всеми остальными анимациями через общий список мониторов и одну кнопку внизу панели.</p></div></div>
    <label class="animation-entity-visible"><input id="weather-enabled" type="checkbox"><span>Показывать погоду</span></label>
    <div class="weather-location-search"><input id="weather-search" type="search" maxlength="120" placeholder="Город или населённый пункт"><button id="weather-search-button" class="button button-secondary" type="button">Найти</button></div>
    <div class="weather-location-results" id="weather-location-results"></div>
    <input id="weather-location-name" type="hidden"><input id="weather-latitude" type="hidden"><input id="weather-longitude" type="hidden"><input id="weather-timezone" type="hidden" value="auto"><input id="weather-position" type="hidden" value="top-right">
    <div class="weather-preview-status" id="weather-location-status">Населённый пункт не выбран.</div>
    <div class="weather-adaptive-note">Предпросмотр показывает те же настройки, которые уйдут на выбранные телевизоры после «Применить все анимации».</div>
    <div class="weather-motion-settings" id="weather-motion-settings" data-weather-motion-disabled="false">
      <label class="weather-motion-toggle"><input id="weather-animation-enabled" type="checkbox"><span>Анимация погоды</span></label>
      <div class="weather-motion-grid">
        <label class="field animation-range-field"><span>Скорость</span><div><input id="weather-animation-speed" type="range" min="0.25" max="2" step="0.05"><output id="weather-animation-speed-output">1.00×</output></div></label>
        <label class="field animation-range-field"><span>Интенсивность</span><div><input id="weather-animation-intensity" type="range" min="0.25" max="2" step="0.05"><output id="weather-animation-intensity-output">100%</output></div></label>
      </div>
      <label class="weather-widget-motion-toggle"><input id="weather-widget-motion-enabled" type="checkbox"><span>Плавное движение информера</span></label>
      <p class="weather-motion-help">Если «Анимация погоды» выключена, дождь, снег, облака, туман, звёзды и свечение не двигаются. Сам информер и данные остаются видимыми.</p>
    </div>
    <div class="weather-config-grid">
      <label class="field"><span>Обновление</span><select id="weather-refresh"><option value="5">5 минут</option><option value="10">10 минут</option><option value="15">15 минут</option><option value="30">30 минут</option><option value="60">60 минут</option></select></label>
      <label class="field"><span>Часов прогноза</span><select id="weather-forecast-items"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="6">6</option></select></label>
      <label class="field animation-range-field"><span>Масштаб</span><div><input id="weather-scale" type="range" min="0.4" max="2.5" step="0.05"><output id="weather-scale-output">1.00×</output></div></label>
      <label class="field animation-range-field"><span>Ширина содержимого</span><div><input id="weather-width" type="range" min="260" max="760" step="10"><output id="weather-width-output">420 px</output></div></label>
      <label class="field animation-range-field"><span>Прозрачность</span><div><input id="weather-opacity" type="range" min="0.35" max="1" step="0.05"><output id="weather-opacity-output">96%</output></div></label>
    </div>
    <div class="weather-position-coordinates">
      <label class="field"><span>X · 0–1920</span><input id="weather-x" type="number" min="0" max="1920" step="1"></label>
      <label class="field"><span>Y · 0–1080</span><input id="weather-y" type="number" min="0" max="1080" step="1"></label>
    </div>
    <div class="weather-position-grid" aria-label="Быстрое положение виджета">
      <button class="button button-secondary" type="button" data-weather-align="top-left">↖</button><button class="button button-secondary" type="button" data-weather-align="top">↑</button><button class="button button-secondary" type="button" data-weather-align="top-right">↗</button>
      <button class="button button-secondary" type="button" data-weather-align="left">←</button><button class="button button-secondary" type="button" data-weather-align="center">●</button><button class="button button-secondary" type="button" data-weather-align="right">→</button>
      <button class="button button-secondary" type="button" data-weather-align="bottom-left">↙</button><button class="button button-secondary" type="button" data-weather-align="bottom">↓</button><button class="button button-secondary" type="button" data-weather-align="bottom-right">↘</button>
    </div>
    <div class="weather-toggle-grid">
      <label><input id="weather-show-condition" type="checkbox"> Состояние</label>
      <label><input id="weather-show-feels" type="checkbox"> Ощущается</label>
      <label><input id="weather-show-humidity" type="checkbox"> Влажность</label>
      <label><input id="weather-show-wind" type="checkbox"> Ветер</label>
      <label><input id="weather-show-forecast" type="checkbox"> Краткий прогноз</label>
    </div>
    <div class="weather-actions"><button id="weather-save" class="button button-secondary" type="button">Сохранить шаблон погоды (без ТВ)</button></div>
  </section>`;
}

function installCard() {
  const scenePanel = document.querySelector('[data-animation-inspector-panel="scene"]');
  if (!(scenePanel instanceof HTMLElement) || node('weather-enabled')) return;
  scenePanel.insertAdjacentHTML('afterbegin', cardMarkup());
}

async function previewWeather() {
  current = formSettings();
  ensureLayer();
  if (!Number.isFinite(current.latitude) || !Number.isFinite(current.longitude)) return;
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    try {
      const query = new URLSearchParams({
        latitude: String(current.latitude), longitude: String(current.longitude),
        timezone: current.timezone || 'auto', name: current.location_name || ''
      });
      snapshot = await api.get(`${ENDPOINTS.preview}?${query}`);
      if (!disposed) ensureLayer();
    } catch {}
  }, 220);
}

function updateTransform(patch) {
  current = normaliseWeatherWidget({ ...formSettings(), ...patch });
  sync(current);
  markApplicationDirty();
}

function bindPositionDragging() {
  const stage = node('animation-stage');
  if (!(stage instanceof HTMLElement)) return;
  stage.addEventListener('pointerdown', (event) => {
    const widget = event.target instanceof Element ? event.target.closest('.weather-widget') : null;
    if (!(widget instanceof HTMLElement) || !current.enabled) return;
    dragging = { pointerId: event.pointerId };
    widget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  stage.addEventListener('pointermove', (event) => {
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    const metrics = weatherSceneMetrics(stage);
    if (!metrics.rect.width || !metrics.rect.height || !metrics.scale) return;
    const x = clamp((event.clientX - metrics.originX - metrics.offsetX) / metrics.scale, 0, WEATHER_SCENE_WIDTH);
    const y = clamp((event.clientY - metrics.originY - metrics.offsetY) / metrics.scale, 0, WEATHER_SCENE_HEIGHT);
    current = normaliseWeatherWidget({ ...current, x, y });
    setValue('weather-x', Math.round(current.x));
    setValue('weather-y', Math.round(current.y));
    ensureLayer();
    markApplicationDirty();
  });
  const finish = (event) => {
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    dragging = null;
  };
  stage.addEventListener('pointerup', finish);
  stage.addEventListener('pointercancel', finish);
}

function bindControls() {
  const ids = [
    'weather-enabled', 'weather-refresh', 'weather-scale', 'weather-width', 'weather-opacity',
    'weather-animation-enabled', 'weather-animation-speed', 'weather-animation-intensity', 'weather-widget-motion-enabled',
    'weather-x', 'weather-y', 'weather-forecast-items', 'weather-show-condition', 'weather-show-feels',
    'weather-show-humidity', 'weather-show-wind', 'weather-show-forecast'
  ];
  for (const id of ids) {
    const control = node(id); if (!control) continue;
    control.addEventListener(control instanceof HTMLSelectElement || control.type === 'checkbox' ? 'change' : 'input', () => {
      current = formSettings();
      syncOutputs(current);
      ensureLayer();
      markApplicationDirty();
    });
  }

  document.querySelectorAll('[data-weather-align]').forEach((button) => button.addEventListener('click', () => {
    const preset = POSITION_PRESETS[button.dataset.weatherAlign];
    if (preset) updateTransform(preset);
  }));
  bindPositionDragging();

  node('weather-search-button')?.addEventListener('click', async () => {
    const query = String(value('weather-search')).trim();
    if (query.length < 2) return;
    const button = node('weather-search-button');
    setPending(button, true, 'Ищем…');
    try {
      const results = await api.get(`${ENDPOINTS.locations}?q=${encodeURIComponent(query)}`);
      const container = node('weather-location-results');
      container?.replaceChildren();
      for (const item of Array.isArray(results) ? results : []) {
        const choice = document.createElement('button');
        choice.type = 'button'; choice.className = 'weather-location-option';
        const title = document.createElement('strong'); title.textContent = item.name;
        const detail = document.createElement('small'); detail.textContent = [item.admin1, item.country].filter(Boolean).join(' · ');
        choice.append(title, detail);
        choice.addEventListener('click', () => {
          setValue('weather-location-name', item.name);
          setValue('weather-latitude', item.latitude);
          setValue('weather-longitude', item.longitude);
          setValue('weather-timezone', item.timezone || 'auto');
          const status = node('weather-location-status');
          if (status) status.textContent = [item.name, item.admin1, item.country].filter(Boolean).join(' · ');
          container?.replaceChildren();
          current = formSettings();
          markApplicationDirty();
          void previewWeather();
        });
        container?.append(choice);
      }
    } catch (error) { setMessage('animation-message', error.message); }
    finally { setPending(button, false, 'Ищем…'); }
  });

  node('weather-save')?.addEventListener('click', async () => {
    const button = node('weather-save'); setPending(button, true, 'Сохраняем…');
    try {
      current = normaliseWeatherWidget(await api.put(ENDPOINTS.settings, formSettings()));
      sync(current);
      setMessage('animation-message', 'Шаблон погоды сохранён. Телевизоры не изменены — для публикации используйте «Применить все анимации».', 'success');
    } catch (error) { setMessage('animation-message', error.message); }
    finally { setPending(button, false, 'Сохраняем…'); }
  });
}

export async function initialiseWeatherStudio() {
  disposed = false;
  installCard();
  if (!node('weather-enabled')) return;
  bindControls();
  const stage = node('animation-stage');
  if (stage) {
    observer = new MutationObserver(() => { if (!disposed) queueMicrotask(ensureLayer); });
    observer.observe(stage, { childList: true });
    resizeObserver = new ResizeObserver(() => {
      if (disposed) return;
      const layer = stage.querySelector('[data-weather-layer]');
      if (layer instanceof HTMLElement) applyWeatherSceneScale(stage, layer);
    });
    resizeObserver.observe(stage);
  }
  screenSelectionListener = (event) => {
    const id = Number(event?.detail?.screenId);
    if (Number.isSafeInteger(id) && id > 0) void loadWeatherForScreen(id);
  };
  window.addEventListener('mira:animation-screen-selected', screenSelectionListener);
  try {
    current = normaliseWeatherWidget(await api.get(ENDPOINTS.settings));
    sync(current);
    const status = node('weather-location-status');
    if (status && current.location_name) status.textContent = current.location_name;
    const currentScreenId = Number(node('animation-screen-select')?.value);
    if (Number.isSafeInteger(currentScreenId) && currentScreenId > 0) await loadWeatherForScreen(currentScreenId);
    else if (Number.isFinite(current.latitude) && Number.isFinite(current.longitude)) await previewWeather();
  } catch (error) { setMessage('animation-message', error.message); }
  return {
    dispose() {
      disposed = true;
      observer?.disconnect();
      observer = null;
      resizeObserver?.disconnect();
      resizeObserver = null;
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = null;
      dragging = null;
      selectedScreenId = null;
      if (screenSelectionListener) window.removeEventListener('mira:animation-screen-selected', screenSelectionListener);
      screenSelectionListener = null;
    }
  };
}
