import { normaliseWeatherWidget, renderWeatherWidget } from '../motion/weather-widget.js';

const LEGACY_CACHE_KEY = 'mira-tv.weather.last.v1';
const CACHE_PREFIX = 'mira-tv.weather.last.v2.';
const PREVIEW_CACHE_KEY = 'mira-tv.weather.preview.last.v1';
const PREVIEW_RETRY_MS = 1500;

function validScreenId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function cachedRecord(key) {
  try {
    const record = JSON.parse(localStorage.getItem(key) || 'null');
    return record && typeof record === 'object' ? record : null;
  } catch {
    return null;
  }
}

function weatherSourceKey(settings) {
  return JSON.stringify([
    String(settings?.location_name || '').trim(),
    settings?.latitude !== null && settings?.latitude !== '' && Number.isFinite(Number(settings?.latitude)) ? Number(settings.latitude) : null,
    settings?.longitude !== null && settings?.longitude !== '' && Number.isFinite(Number(settings?.longitude)) ? Number(settings.longitude) : null,
    String(settings?.timezone || 'auto')
  ]);
}

function hasWeatherCoordinates(settings) {
  return settings?.latitude !== null
    && settings?.latitude !== ''
    && settings?.longitude !== null
    && settings?.longitude !== ''
    && Number.isFinite(Number(settings.latitude))
    && Number.isFinite(Number(settings.longitude));
}

export class PlayerWeatherRuntime {
  constructor(stage, { layer = null, endpoint = '/api/device/weather', preview = false, onRender = null } = {}) {
    if (!(stage instanceof HTMLElement)) throw new TypeError('Weather runtime requires an HTMLElement stage.');
    this.stage = stage;
    this.layer = layer instanceof HTMLElement ? layer : stage.querySelector('[data-weather-layer]');
    this.settings = normaliseWeatherWidget();
    this.endpoint = String(endpoint || '/api/device/weather');
    this.preview = preview === true;
    this.onRender = typeof onRender === 'function' ? onRender : null;
    this.snapshot = null;
    this.timer = null;
    this.generation = 0;
    this.screenId = null;
    this.sourceKey = '';
    this.active = this.preview || stage.dataset.playerActive === 'true';
    this.visible = document.visibilityState !== 'hidden';
    this.destroyed = false;

    this.handlePlayerActivity = (event) => {
      this.active = this.preview || event?.detail?.active === true;
      if (this.active) this.schedule(1000);
      else this.clearTimer();
    };
    this.handleVisibilityChange = () => {
      this.visible = document.visibilityState !== 'hidden';
      if (this.visible) this.schedule(1000);
      else this.clearTimer();
    };
    this.handleOnline = () => this.schedule(1000);
    this.handleOffline = () => this.clearTimer();

    this.stage.addEventListener('mira:player-active', this.handlePlayerActivity);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  setLayer(layer) {
    const next = layer instanceof HTMLElement ? layer : null;
    if (next === this.layer) return;
    this.layer?.replaceChildren();
    this.layer = next;
    if (this.layer) this.render();
  }

  ensureLayer() {
    if (this.layer?.isConnected) return this.layer;
    const layer = this.stage.querySelector('[data-weather-layer], [data-scene-weather-mount]');
    if (layer instanceof HTMLElement) {
      this.layer = layer;
      return layer;
    }
    return null;
  }

  cacheKey() {
    if (this.preview) return PREVIEW_CACHE_KEY;
    return this.screenId ? `${CACHE_PREFIX}${this.screenId}` : '';
  }

  syncMenuPalette() {
    const section = this.stage.querySelector('[data-player-menu-layer] .table-section rect');
    const primary = this.stage.querySelector('[data-player-menu-layer] .table-item.tone-light .item-name')
      || this.stage.querySelector('[data-player-menu-layer] .item-name');
    const accent = section?.getAttribute?.('fill');
    const text = primary?.getAttribute?.('fill');
    if (/^#[0-9a-f]{6}$/i.test(String(accent || ''))) this.stage.style.setProperty('--mira-menu-accent', accent);
    if (/^#[0-9a-f]{6}$/i.test(String(text || ''))) this.stage.style.setProperty('--mira-menu-text', text);
  }

  render() {
    if (this.destroyed) return;
    this.syncMenuPalette();
    const target = this.ensureLayer();
    if (!target) return;
    if (this.settings.enabled && this.snapshot) renderWeatherWidget(target, this.settings, this.snapshot);
    else target.replaceChildren();
    this.onRender?.(target);
  }

  loadCachedWeather(expectedSettings = this.settings) {
    const key = this.cacheKey();
    if (!key) return;
    let record = cachedRecord(key);
    if (!record && !this.preview) {
      const legacy = cachedRecord(LEGACY_CACHE_KEY);
      const legacyScreenId = validScreenId(legacy?.settings?.screen_id);
      if (legacy && legacyScreenId === this.screenId) {
        record = legacy;
        try { localStorage.setItem(key, JSON.stringify(legacy)); } catch {}
      }
      try { localStorage.removeItem(LEGACY_CACHE_KEY); } catch {}
    }
    if (!record || weatherSourceKey(record.settings) !== weatherSourceKey(expectedSettings)) return;
    this.snapshot = record.snapshot && typeof record.snapshot === 'object' ? record.snapshot : null;
  }

  saveCachedWeather() {
    const key = this.cacheKey();
    if (!key) return;
    try {
      if (!this.settings.enabled || !this.snapshot) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify({
        screen_id: this.preview ? undefined : this.screenId,
        settings: this.preview ? { ...this.settings } : { ...this.settings, screen_id: this.screenId },
        snapshot: this.snapshot,
        saved_at: new Date().toISOString()
      }));
    } catch {}
  }

  switchScreen(value) {
    const next = validScreenId(value);
    if (!next || next === this.screenId) return false;
    this.screenId = next;
    this.snapshot = null;
    return true;
  }

  clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  schedule(delay) {
    this.clearTimer();
    if (this.destroyed || !this.settings.enabled || !hasWeatherCoordinates(this.settings) || !this.active || !this.visible || !navigator.onLine) return;
    const wait = Number.isFinite(Number(delay)) ? Number(delay) : this.settings.refresh_minutes * 60_000;
    const minimumDelay = this.preview ? 200 : 1000;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refresh();
    }, Math.max(minimumDelay, wait));
  }

  requestUrl() {
    if (!this.preview) return this.endpoint;
    const url = new URL(this.endpoint, window.location.origin);
    url.searchParams.set('name', this.settings.location_name || '');
    url.searchParams.set('latitude', String(this.settings.latitude));
    url.searchParams.set('longitude', String(this.settings.longitude));
    url.searchParams.set('timezone', this.settings.timezone || 'auto');
    return url.href;
  }

  async refresh({ configurationChanged = false } = {}) {
    if (this.destroyed || !this.active || !this.visible || !navigator.onLine || !this.settings.enabled || !hasWeatherCoordinates(this.settings)) return;
    const currentGeneration = ++this.generation;
    try {
      const response = await fetch(this.requestUrl(), { cache: 'no-store', credentials: 'same-origin' });
      if (response.status === 204) {
        this.snapshot = null;
        this.render();
        this.saveCachedWeather();
        this.clearTimer();
        return;
      }
      if (response.status === 401 || response.status === 403) return;
      if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
      const body = await response.json();
      if (currentGeneration !== this.generation || this.destroyed) return;
      if (this.preview) {
        this.snapshot = body && typeof body === 'object' ? body : null;
      } else {
        const responseScreenId = validScreenId(body?.settings?.screen_id);
        if (responseScreenId) this.switchScreen(responseScreenId);
        // SceneElement is the only configuration owner. The weather endpoint supplies data, not UI settings.
        this.snapshot = body?.snapshot || this.snapshot;
      }
      this.render();
      this.saveCachedWeather();
      this.schedule(configurationChanged ? Math.min(this.settings.refresh_minutes * 60_000, 60_000) : undefined);
    } catch (error) {
      console.warn('MIRA-TV weather refresh failed', error);
      this.schedule(this.preview ? PREVIEW_RETRY_MS : 60_000);
    }
  }

  applyContext(settings, screenId, { configurationChanged = false, menuChanged = false } = {}) {
    if (this.destroyed) return;
    const nextSettings = normaliseWeatherWidget(settings);
    const nextSourceKey = weatherSourceKey(nextSettings);
    const screenChanged = this.switchScreen(screenId);
    const sourceChanged = nextSourceKey !== this.sourceKey;
    this.settings = nextSettings;
    this.sourceKey = nextSourceKey;

    if (screenChanged || sourceChanged) {
      this.generation += 1;
      this.clearTimer();
      this.snapshot = null;
      this.loadCachedWeather(this.settings);
    }

    if (!this.settings.enabled || !hasWeatherCoordinates(this.settings)) {
      this.snapshot = null;
      this.clearTimer();
      this.render();
      this.saveCachedWeather();
      return;
    }

    if (menuChanged || screenChanged || sourceChanged || configurationChanged) this.render();
    if (navigator.onLine && this.active && this.visible && (screenChanged || sourceChanged || !this.snapshot)) {
      this.schedule(sourceChanged ? 250 : 1000);
    } else {
      this.schedule();
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    this.clearTimer();
    this.stage.removeEventListener('mira:player-active', this.handlePlayerActivity);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.layer?.replaceChildren();
    this.layer = null;
    this.snapshot = null;
    this.onRender = null;
  }
}
