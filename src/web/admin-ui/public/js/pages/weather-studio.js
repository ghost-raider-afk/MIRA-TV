import { api } from '../core/api.js';
import { setMessage, setPending } from '../core/dom.js';
import { normaliseWeatherWidget, renderWeatherWidget, WEATHER_SAMPLE } from '../motion/weather-widget.js';

const ENDPOINTS = Object.freeze({
  settings: '/api/weather/settings',
  apply: '/api/weather/apply',
  screens: '/api/screens',
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
let previewTimer = null;
let dragging = null;
let weatherScreens = [];
const weatherTargetScreenIds = new Set();

function node(id) { return document.getElementById(id); }
function checked(id) { return node(id)?.checked === true; }
function value(id) { return node(id)?.value ?? ''; }
function number(id) { return Number(value(id)); }
function setValue(id, next) { const target = node(id); if (target) target.value = next === null || next === undefined ? '' : String(next); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }

function ensureLayer() {
  const stage = node('animation-stage');
  if (!(stage instanceof HTMLElement)) return null;
  let layer = stage.querySelector('[data-weather-layer]');
  if (!(layer instanceof HTMLElement)) {
    layer = document.createElement('div');
    layer.setAttribute('data-weather-layer', '');
    stage.append(layer);
  }
  layer.dataset.weatherEditor = 'true';
  renderWeatherWidget(layer, current, snapshot);
  return layer;
}

function formSettings() {
  return normaliseWeatherWidget({
    enabled: checked('weather-enabled'),
    location_name: value('weather-location-name'),
    latitude: number('weather-latitude'),
    longitude: number('weather-longitude'),
    timezone: value('weather-timezone') || 'auto',
    position: value('weather-position') || current.position,
    x: number('weather-x'),
    y: number('weather-y'),
    scale: number('weather-scale'),
    refresh_minutes: number('weather-refresh'),
    width_px: number('weather-width'),
    opacity: number('weather-opacity'),
    show_condition: checked('weather-show-condition'),
    show_feels_like: checked('weather-show-feels'),
    show_humidity: checked('weather-show-humidity'),
    show_wind: checked('weather-show-wind'),
    show_forecast: checked('weather-show-forecast'),
    forecast_items: number('weather-forecast-items')
  });
}

function syncTransformOutputs(settings = current) {
  const scaleOutput = node('weather-scale-output');
  if (scaleOutput) scaleOutput.textContent = `${settings.scale.toFixed(2)}×`;
  const widthOutput = node('weather-width-output');
  if (widthOutput) widthOutput.textContent = `${Math.round(settings.width_px)} px`;
  const opacityOutput = node('weather-opacity-output');
  if (opacityOutput) opacityOutput.textContent = `${Math.round(settings.opacity * 100)}%`;
}

function sync(settings = current) {
  current = normaliseWeatherWidget(settings);
  const enabled = node('weather-enabled'); if (enabled) enabled.checked = current.enabled;
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
  setValue('weather-forecast-items', current.forecast_items);
  for (const [id, state] of Object.entries({
    'weather-show-condition': current.show_condition,
    'weather-show-feels': current.show_feels_like,
    'weather-show-humidity': current.show_humidity,
    'weather-show-wind': current.show_wind,
    'weather-show-forecast': current.show_forecast
  })) { const input = node(id); if (input) input.checked = state; }
  syncTransformOutputs(current);
  ensureLayer();
}

function currentPreviewScreenId() {
  const id = Number(new URL(window.location.href).searchParams.get('screen'));
  if (Number.isSafeInteger(id) && id > 0 && weatherScreens.some((screen) => Number(screen.id) === id)) return id;
  return Number(weatherScreens[0]?.id) || null;
}

function selectedScreenIds() {
  return [...weatherTargetScreenIds].filter((id) => weatherScreens.some((screen) => Number(screen.id) === id));
}

function screenLabel(screen) {
  return `${screen.location_name || 'Без точки'} — ${screen.name}`;
}

function targetCountLabel(count) {
  if (count === 1) return '1 монитор';
  if (count > 1 && count < 5) return `${count} монитора`;
  return `${count} мониторов`;
}

function updateWeatherTargetSummary() {
  const ids = selectedScreenIds();
  const summary = node('weather-target-summary');
  if (summary) summary.textContent = ids.length ? `Выбрано: ${targetCountLabel(ids.length)}` : 'Мониторы не выбраны';
  const apply = node('weather-apply');
  if (apply instanceof HTMLButtonElement && !apply.disabled) {
    const label = ids.length ? `Применить к ${targetCountLabel(ids.length)}` : 'Выберите монитор';
    apply.textContent = label;
    apply.dataset.label = label;
  }
  if (apply instanceof HTMLButtonElement) apply.disabled = ids.length === 0;
  const load = node('weather-load-target');
  if (load instanceof HTMLButtonElement) load.disabled = ids.length !== 1;
}

function renderWeatherTargets() {
  const list = node('weather-target-list');
  if (!(list instanceof HTMLElement)) return;
  list.replaceChildren();
  for (const screen of weatherScreens) {
    const id = Number(screen.id);
    const label = document.createElement('label');
    label.className = 'animation-target-item weather-target-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = String(id);
    checkbox.checked = weatherTargetScreenIds.has(id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) weatherTargetScreenIds.add(id); else weatherTargetScreenIds.delete(id);
      updateWeatherTargetSummary();
    });
    const text = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = screen.name;
    const location = document.createElement('small');
    location.textContent = screen.location_name || 'Без точки';
    text.append(name, location);
    label.append(checkbox, text);
    list.append(label);
  }
  updateWeatherTargetSummary();
}

function selectOnlyCurrentWeatherScreen() {
  weatherTargetScreenIds.clear();
  const id = currentPreviewScreenId();
  if (id) weatherTargetScreenIds.add(id);
  renderWeatherTargets();
}

async function loadWeatherTargets() {
  const screens = await api.get(ENDPOINTS.screens);
  weatherScreens = Array.isArray(screens) ? screens : [];
  weatherTargetScreenIds.clear();
  const currentId = currentPreviewScreenId();
  if (currentId) weatherTargetScreenIds.add(currentId);
  renderWeatherTargets();
}

async function loadSelectedScreenWeather() {
  const ids = selectedScreenIds();
  if (ids.length !== 1) return;
  const button = node('weather-load-target');
  setPending(button, true, 'Загружаем…');
  try {
    current = normaliseWeatherWidget(await api.get(ENDPOINTS.screen(ids[0])));
    sync(current);
    const screen = weatherScreens.find((item) => Number(item.id) === ids[0]);
    const status = node('weather-location-status');
    if (status) status.textContent = current.location_name || `Погода на «${screen?.name || 'мониторе'}» не настроена.`;
    if (Number.isFinite(current.latitude) && Number.isFinite(current.longitude)) await previewWeather();
    setMessage('animation-message', `Загружены настройки погоды: ${screenLabel(screen || { name: ids[0] })}.`, 'info');
  } catch (error) { setMessage('animation-message', error.message); }
  finally { setPending(button, false, 'Загружаем…'); updateWeatherTargetSummary(); }
}

function cardMarkup() {
  return `<section class="settings-card weather-settings-card" aria-label="Виджет погоды">
    <div class="card-heading"><div><p class="eyebrow">WEATHER</p><h2>Погода</h2><p>Погода назначается только выбранным мониторам. Для каждого монитора можно сохранить своё положение и масштаб.</p></div></div>
    <div class="weather-monitor-targets">
      <div class="weather-targets-head"><div><strong>Мониторы для погоды</strong><small id="weather-target-summary">Мониторы не выбраны</small></div><div><button id="weather-target-current" class="button button-secondary" type="button">Текущий</button><button id="weather-target-all" class="button button-secondary" type="button">Все</button><button id="weather-target-none" class="button button-secondary" type="button">Снять</button></div></div>
      <div class="animation-target-list weather-target-list" id="weather-target-list"></div>
      <button id="weather-load-target" class="button button-secondary" type="button" disabled>Загрузить настройки выбранного монитора</button>
    </div>
    <label class="animation-entity-visible"><input id="weather-enabled" type="checkbox"><span>Показывать погоду на выбранных мониторах</span></label>
    <div class="weather-location-search"><input id="weather-search" type="search" maxlength="120" placeholder="Город или населённый пункт"><button id="weather-search-button" class="button button-secondary" type="button">Найти</button></div>
    <div class="weather-location-results" id="weather-location-results"></div>
    <input id="weather-location-name" type="hidden"><input id="weather-latitude" type="hidden"><input id="weather-longitude" type="hidden"><input id="weather-timezone" type="hidden" value="auto"><input id="weather-position" type="hidden" value="top-right">
    <div class="weather-preview-status" id="weather-location-status">Населённый пункт не выбран.</div>
    <div class="weather-adaptive-note">Атмосфера погоды занимает всю сцену, а информер перемещается отдельно. Цвет текста и акцентов берётся из текущей таблицы.</div>
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
    <div class="weather-actions"><button id="weather-save" class="button button-secondary" type="button">Сохранить как шаблон</button><button id="weather-apply" class="button button-primary" type="button" disabled>Выберите монитор</button></div>
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
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = clamp(((event.clientX - rect.left) / rect.width) * 1920, 0, 1920);
    const y = clamp(((event.clientY - rect.top) / rect.height) * 1080, 0, 1080);
    current = normaliseWeatherWidget({ ...current, x, y });
    setValue('weather-x', Math.round(current.x));
    setValue('weather-y', Math.round(current.y));
    ensureLayer();
  });
  const finish = (event) => {
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    dragging = null;
  };
  stage.addEventListener('pointerup', finish);
  stage.addEventListener('pointercancel', finish);
}

function bindControls() {
  for (const id of ['weather-enabled','weather-refresh','weather-scale','weather-width','weather-opacity','weather-x','weather-y','weather-forecast-items','weather-show-condition','weather-show-feels','weather-show-humidity','weather-show-wind','weather-show-forecast']) {
    const control = node(id); if (!control) continue;
    control.addEventListener(control instanceof HTMLSelectElement || control.type === 'checkbox' ? 'change' : 'input', () => {
      current = formSettings();
      syncTransformOutputs(current);
      ensureLayer();
    });
  }

  document.querySelectorAll('[data-weather-align]').forEach((button) => button.addEventListener('click', () => {
    const preset = POSITION_PRESETS[button.dataset.weatherAlign];
    if (preset) updateTransform(preset);
  }));
  bindPositionDragging();

  node('weather-target-current')?.addEventListener('click', selectOnlyCurrentWeatherScreen);
  node('weather-target-all')?.addEventListener('click', () => {
    weatherTargetScreenIds.clear();
    for (const screen of weatherScreens) weatherTargetScreenIds.add(Number(screen.id));
    renderWeatherTargets();
  });
  node('weather-target-none')?.addEventListener('click', () => {
    weatherTargetScreenIds.clear();
    renderWeatherTargets();
  });
  node('weather-load-target')?.addEventListener('click', () => { void loadSelectedScreenWeather(); });

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
          setValue('weather-location-name', item.name); setValue('weather-latitude', item.latitude); setValue('weather-longitude', item.longitude); setValue('weather-timezone', item.timezone || 'auto');
          const status = node('weather-location-status'); if (status) status.textContent = [item.name, item.admin1, item.country].filter(Boolean).join(' · ');
          container?.replaceChildren(); void previewWeather();
        });
        container?.append(choice);
      }
    } catch (error) { setMessage('animation-message', error.message); }
    finally { setPending(button, false, 'Ищем…'); }
  });

  node('weather-save')?.addEventListener('click', async () => {
    const button = node('weather-save'); setPending(button, true, 'Сохраняем…');
    try { current = normaliseWeatherWidget(await api.put(ENDPOINTS.settings, formSettings())); sync(current); setMessage('animation-message', 'Шаблон погоды сохранён. Мониторы не изменены.', 'success'); }
    catch (error) { setMessage('animation-message', error.message); }
    finally { setPending(button, false, 'Сохраняем…'); }
  });

  node('weather-apply')?.addEventListener('click', async () => {
    const screenIds = selectedScreenIds();
    if (!screenIds.length) { setMessage('animation-message', 'Выберите хотя бы один монитор для погоды.', 'error'); return; }
    const button = node('weather-apply'); setPending(button, true, 'Применяем…');
    try {
      const result = await api.put(ENDPOINTS.apply, { screen_ids: screenIds, settings: formSettings() });
      current = normaliseWeatherWidget(result.settings); sync(current);
      setMessage('animation-message', `Погода применена только к выбранным мониторам: ${result.applied_screen_ids.length}.`, 'success');
    } catch (error) { setMessage('animation-message', error.message); }
    finally { setPending(button, false, 'Применяем…'); updateWeatherTargetSummary(); }
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
  }
  try {
    const [saved] = await Promise.all([api.get(ENDPOINTS.settings), loadWeatherTargets()]);
    current = normaliseWeatherWidget(saved);
    sync(current);
    const status = node('weather-location-status');
    if (status && current.location_name) status.textContent = current.location_name;
    if (Number.isFinite(current.latitude) && Number.isFinite(current.longitude)) await previewWeather();
  } catch (error) { setMessage('animation-message', error.message); }
  return {
    dispose() {
      disposed = true;
      observer?.disconnect();
      observer = null;
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = null;
      dragging = null;
      weatherScreens = [];
      weatherTargetScreenIds.clear();
    }
  };
}
