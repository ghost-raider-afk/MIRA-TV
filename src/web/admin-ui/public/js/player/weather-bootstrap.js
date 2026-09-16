import { normaliseWeatherWidget, renderWeatherWidget } from '../motion/weather-widget.js';
import { loadLastKnownGood } from './player-store.js';

const LEGACY_CACHE_KEY = 'mira-tv.weather.last.v1';
const CACHE_PREFIX = 'mira-tv.weather.last.v2.';
const stage = document.querySelector('[data-player-stage]');
let layer = null;
let settings = normaliseWeatherWidget();
let snapshot = null;
let timer = null;
let generation = 0;
let screenId = null;
let active = true;
let visible = document.visibilityState !== 'hidden';

function validScreenId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function cacheKey() {
  return screenId ? `${CACHE_PREFIX}${screenId}` : '';
}

function ensureLayer() {
  if (!(stage instanceof HTMLElement)) return null;
  if (layer?.isConnected) return layer;
  layer = stage.querySelector('[data-weather-layer]');
  if (!(layer instanceof HTMLElement)) {
    layer = document.createElement('div');
    layer.className = 'tv-player-weather-layer';
    layer.setAttribute('data-weather-layer', '');
    stage.append(layer);
  }
  return layer;
}

function syncMenuPalette() {
  if (!(stage instanceof HTMLElement)) return;
  const section = stage.querySelector('[data-player-menu-layer] .table-section rect');
  const primary = stage.querySelector('[data-player-menu-layer] .table-item.tone-light .item-name')
    || stage.querySelector('[data-player-menu-layer] .item-name');
  const accent = section?.getAttribute?.('fill');
  const text = primary?.getAttribute?.('fill');
  if (/^#[0-9a-f]{6}$/i.test(String(accent || ''))) stage.style.setProperty('--mira-menu-accent', accent);
  if (/^#[0-9a-f]{6}$/i.test(String(text || ''))) stage.style.setProperty('--mira-menu-text', text);
}

function renderCurrentWeather() {
  syncMenuPalette();
  const target = ensureLayer();
  if (settings.enabled && snapshot) renderWeatherWidget(target, settings, snapshot);
  else target?.replaceChildren();
}

function cachedRecord(key) {
  try {
    const record = JSON.parse(localStorage.getItem(key) || 'null');
    return record && typeof record === 'object' ? record : null;
  } catch {
    return null;
  }
}

function loadCachedWeather() {
  const key = cacheKey();
  if (!key) return;
  let record = cachedRecord(key);

  if (!record) {
    const legacy = cachedRecord(LEGACY_CACHE_KEY);
    const legacyScreenId = validScreenId(legacy?.settings?.screen_id);
    if (legacy && legacyScreenId === screenId) {
      record = legacy;
      try { localStorage.setItem(key, JSON.stringify(legacy)); } catch {}
    }
    try { localStorage.removeItem(LEGACY_CACHE_KEY); } catch {}
  }

  if (!record) return;
  settings = normaliseWeatherWidget(record.settings);
  snapshot = record.snapshot && typeof record.snapshot === 'object' ? record.snapshot : null;
}

function saveCachedWeather() {
  const key = cacheKey();
  if (!key) return;
  try {
    if (!settings.enabled || !snapshot) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify({
      screen_id: screenId,
      settings: { ...settings, screen_id: screenId },
      snapshot,
      saved_at: new Date().toISOString()
    }));
  } catch {}
}

function switchScreen(value) {
  const next = validScreenId(value);
  if (!next || next === screenId) return;
  screenId = next;
  settings = normaliseWeatherWidget();
  snapshot = null;
  loadCachedWeather();
  renderCurrentWeather();
}

async function restoreScreenWeather() {
  try {
    const record = await loadLastKnownGood();
    const context = record?.context && typeof record.context === 'object' ? record.context : null;
    const id = validScreenId(record?.screen_id ?? context?.screen?.id);
    if (!id) return;
    switchScreen(id);
    if (context?.weather && typeof context.weather === 'object') {
      settings = normaliseWeatherWidget(context.weather);
      if (!settings.enabled) snapshot = null;
      renderCurrentWeather();
    }
  } catch {}
}

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

function schedule(delay) {
  clearTimer();
  if (!settings.enabled || !active || !visible || !navigator.onLine) return;
  const wait = Number.isFinite(Number(delay)) ? Number(delay) : settings.refresh_minutes * 60_000;
  timer = setTimeout(() => { timer = null; void refresh(); }, Math.max(1000, wait));
}

async function refresh({ configurationChanged = false } = {}) {
  if (!active || !visible || !navigator.onLine) return;
  const currentGeneration = ++generation;
  try {
    const response = await fetch('/api/device/weather', { cache: 'no-store', credentials: 'same-origin' });
    if (response.status === 204) {
      settings = normaliseWeatherWidget();
      snapshot = null;
      renderCurrentWeather();
      saveCachedWeather();
      clearTimer();
      return;
    }
    if (response.status === 401 || response.status === 403) return;
    if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
    const body = await response.json();
    if (currentGeneration !== generation) return;
    switchScreen(body?.settings?.screen_id);
    settings = normaliseWeatherWidget(body?.settings);
    snapshot = body?.snapshot || snapshot;
    renderCurrentWeather();
    saveCachedWeather();
    schedule(configurationChanged ? Math.min(settings.refresh_minutes * 60_000, 60_000) : undefined);
  } catch (error) {
    console.warn('MIRA-TV weather refresh failed', error);
    schedule(60_000);
  }
}

if (stage instanceof HTMLElement) {
  void restoreScreenWeather().finally(() => {
    if (navigator.onLine) void refresh({ configurationChanged: true });
  });
  stage.addEventListener('mira:player-active', (event) => {
    active = event?.detail?.active !== false;
    if (active) schedule(1000); else clearTimer();
  });
  stage.addEventListener('mira:entity-rendered', syncMenuPalette);
  document.addEventListener('visibilitychange', () => {
    visible = document.visibilityState !== 'hidden';
    if (visible) schedule(1000); else clearTimer();
  });
  window.addEventListener('online', () => schedule(1000));
  window.addEventListener('offline', clearTimer);
  window.addEventListener('mira:player-realtime-change', () => {
    syncMenuPalette();
    renderCurrentWeather();
    void restoreScreenWeather().finally(() => schedule(500));
  });
  window.addEventListener('mira:player-realtime-connected', () => schedule(1000));
}
