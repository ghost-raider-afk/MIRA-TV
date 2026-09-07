import { api } from '../core/api.js';
import { setMessage, setPending } from '../core/dom.js';
import { normaliseWeatherWidget, renderWeatherWidget, WEATHER_SAMPLE } from '../motion/weather-widget.js';

const ENDPOINTS = Object.freeze({
  settings: '/api/weather/settings',
  apply: '/api/weather/apply',
  locations: '/api/weather/locations',
  preview: '/api/weather/preview'
});

let current = normaliseWeatherWidget();
let snapshot = WEATHER_SAMPLE;
let disposed = false;
let observer = null;
let previewTimer = null;

function node(id) { return document.getElementById(id); }
function checked(id) { return node(id)?.checked === true; }
function value(id) { return node(id)?.value ?? ''; }
function number(id) { return Number(value(id)); }
function setValue(id, next) { const target = node(id); if (target) target.value = next === null || next === undefined ? '' : String(next); }

function ensureLayer() {
  const stage = node('animation-stage');
  if (!(stage instanceof HTMLElement)) return null;
  let layer = stage.querySelector('[data-weather-layer]');
  if (!(layer instanceof HTMLElement)) {
    layer = document.createElement('div');
    layer.setAttribute('data-weather-layer', '');
    stage.append(layer);
  }
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
    position: value('weather-position'),
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

function sync(settings = current) {
  current = normaliseWeatherWidget(settings);
  const enabled = node('weather-enabled'); if (enabled) enabled.checked = current.enabled;
  setValue('weather-location-name', current.location_name);
  setValue('weather-latitude', current.latitude);
  setValue('weather-longitude', current.longitude);
  setValue('weather-timezone', current.timezone);
  setValue('weather-position', current.position);
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
  ensureLayer();
}

function selectedScreenIds() {
  return [...document.querySelectorAll('#animation-target-list input[type="checkbox"]:checked')]
    .map((input) => Number(input.value)).filter((id) => Number.isSafeInteger(id) && id > 0);
}

function cardMarkup() {
  return `<section class="settings-card weather-settings-card" aria-label="Виджет погоды">
    <div class="card-heading"><div><p class="eyebrow">WEATHER</p><h2>Погода</h2><p>Погодный информер поверх общего фона сцены.</p></div></div>
    <label class="animation-entity-visible"><input id="weather-enabled" type="checkbox"><span>Показывать погоду</span></label>
    <div class="weather-location-search"><input id="weather-search" type="search" maxlength="120" placeholder="Город или населённый пункт"><button id="weather-search-button" class="button button-secondary" type="button">Найти</button></div>
    <div class="weather-location-results" id="weather-location-results"></div>
    <input id="weather-location-name" type="hidden"><input id="weather-latitude" type="hidden"><input id="weather-longitude" type="hidden"><input id="weather-timezone" type="hidden" value="auto">
    <div class="weather-preview-status" id="weather-location-status">Населённый пункт не выбран.</div>
    <div class="weather-adaptive-note">Оформление и анимация меняются автоматически по текущей погоде и времени суток: дождь, снег, гроза, туман, облака, солнце или ночное небо.</div>
    <div class="weather-config-grid">
      <label class="field"><span>Положение</span><select id="weather-position"><option value="top-left">Сверху слева</option><option value="top-right">Сверху справа</option><option value="bottom-left">Снизу слева</option><option value="bottom-right">Снизу справа</option></select></label>
      <label class="field"><span>Обновление</span><select id="weather-refresh"><option value="5">5 минут</option><option value="10">10 минут</option><option value="15">15 минут</option><option value="30">30 минут</option><option value="60">60 минут</option></select></label>
      <label class="field"><span>Ширина</span><input id="weather-width" type="range" min="260" max="760" step="10"></label>
      <label class="field"><span>Прозрачность</span><input id="weather-opacity" type="range" min="0.35" max="1" step="0.05"></label>
      <label class="field"><span>Часов прогноза</span><select id="weather-forecast-items"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="6">6</option></select></label>
    </div>
    <div class="weather-toggle-grid">
      <label><input id="weather-show-condition" type="checkbox"> Состояние</label>
      <label><input id="weather-show-feels" type="checkbox"> Ощущается</label>
      <label><input id="weather-show-humidity" type="checkbox"> Влажность</label>
      <label><input id="weather-show-wind" type="checkbox"> Ветер</label>
      <label><input id="weather-show-forecast" type="checkbox"> Краткий прогноз</label>
    </div>
    <div class="weather-actions"><button id="weather-save" class="button button-secondary" type="button">Сохранить</button><button id="weather-apply" class="button button-primary" type="button">Применить к выбранным</button></div>
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

function bindControls() {
  for (const id of ['weather-enabled','weather-position','weather-refresh','weather-width','weather-opacity','weather-forecast-items','weather-show-condition','weather-show-feels','weather-show-humidity','weather-show-wind','weather-show-forecast']) {
    const control = node(id); if (!control) continue;
    control.addEventListener(control instanceof HTMLSelectElement || control.type === 'checkbox' ? 'change' : 'input', () => { current = formSettings(); ensureLayer(); });
  }

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
    try { current = normaliseWeatherWidget(await api.put(ENDPOINTS.settings, formSettings())); sync(current); setMessage('animation-message', 'Настройки погоды сохранены.', 'success'); }
    catch (error) { setMessage('animation-message', error.message); }
    finally { setPending(button, false, 'Сохраняем…'); }
  });

  node('weather-apply')?.addEventListener('click', async () => {
    const screenIds = selectedScreenIds();
    if (!screenIds.length) { setMessage('animation-message', 'Выберите хотя бы один монитор.', 'error'); return; }
    const button = node('weather-apply'); setPending(button, true, 'Применяем…');
    try {
      const result = await api.put(ENDPOINTS.apply, { screen_ids: screenIds, settings: formSettings() });
      current = normaliseWeatherWidget(result.settings); sync(current);
      setMessage('animation-message', `Погода применена к мониторам: ${result.applied_screen_ids.length}.`, 'success');
    } catch (error) { setMessage('animation-message', error.message); }
    finally { setPending(button, false, 'Применяем…'); }
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
    current = normaliseWeatherWidget(await api.get(ENDPOINTS.settings));
    sync(current);
    const status = node('weather-location-status');
    if (status && current.location_name) status.textContent = current.location_name;
    if (Number.isFinite(current.latitude) && Number.isFinite(current.longitude)) await previewWeather();
  } catch (error) { setMessage('animation-message', error.message); }
  return { dispose() { disposed = true; observer?.disconnect(); observer = null; if (previewTimer) clearTimeout(previewTimer); previewTimer = null; } };
}
