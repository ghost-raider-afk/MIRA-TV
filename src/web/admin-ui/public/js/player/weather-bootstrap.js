import { normaliseWeatherWidget, renderWeatherWidget } from '../motion/weather-widget.js';

const CACHE_KEY = 'mira-tv.weather.last.v1';
const stage = document.querySelector('[data-player-stage]');
let layer = null;
let settings = normaliseWeatherWidget();
let snapshot = null;
let timer = null;
let generation = 0;
let active = true;
let visible = document.visibilityState !== 'hidden';

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

function loadCachedWeather() {
  try {
    const record = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!record || typeof record !== 'object') return;
    settings = normaliseWeatherWidget(record.settings);
    snapshot = record.snapshot && typeof record.snapshot === 'object' ? record.snapshot : null;
    if (settings.enabled && snapshot) renderWeatherWidget(ensureLayer(), settings, snapshot);
  } catch {}
}

function saveCachedWeather() {
  try {
    if (!settings.enabled || !snapshot) localStorage.removeItem(CACHE_KEY);
    else localStorage.setItem(CACHE_KEY, JSON.stringify({ settings, snapshot, saved_at: new Date().toISOString() }));
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
      ensureLayer()?.replaceChildren();
      saveCachedWeather();
      clearTimer();
      return;
    }
    if (response.status === 401 || response.status === 403) return;
    if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
    const body = await response.json();
    if (currentGeneration !== generation) return;
    settings = normaliseWeatherWidget(body?.settings);
    snapshot = body?.snapshot || snapshot;
    if (settings.enabled && snapshot) renderWeatherWidget(ensureLayer(), settings, snapshot);
    else ensureLayer()?.replaceChildren();
    saveCachedWeather();
    schedule(configurationChanged ? Math.min(settings.refresh_minutes * 60_000, 60_000) : undefined);
  } catch (error) {
    console.warn('MIRA-TV weather refresh failed', error);
    // Keep the last successful snapshot visible. Retry only while the browser says it is online.
    schedule(60_000);
  }
}

if (stage instanceof HTMLElement) {
  loadCachedWeather();
  stage.addEventListener('mira:player-active', (event) => {
    active = event?.detail?.active !== false;
    if (active) schedule(1000); else clearTimer();
  });
  document.addEventListener('visibilitychange', () => {
    visible = document.visibilityState !== 'hidden';
    if (visible) schedule(1000); else clearTimer();
  });
  window.addEventListener('online', () => schedule(1000));
  window.addEventListener('offline', clearTimer);
  window.addEventListener('mira:player-realtime-change', () => schedule(500));
  window.addEventListener('mira:player-realtime-connected', () => schedule(1000));
  if (navigator.onLine) void refresh({ configurationChanged: true });
}
