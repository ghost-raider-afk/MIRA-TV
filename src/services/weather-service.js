import { sceneWeatherSettings } from '../contracts/scene.js';
import { cityTimezone, fetchJson, weatherCoordinates, weatherSourceKey } from './weather/providers/common.js';
import { fetchMetNo } from './weather/providers/met-no.js';
import { fetchOpenMeteo } from './weather/providers/open-meteo.js';

const PROVIDERS = Object.freeze({
  'met-no': Object.freeze({ label:'MET Norway', fetch:fetchMetNo }),
  'open-meteo': Object.freeze({ label:'Open-Meteo', fetch:fetchOpenMeteo })
});

function finite(value, min, max) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

export function hasWeatherCoordinates(settings) {
  return finite(settings?.latitude, -90, 90) !== null
    && finite(settings?.longitude, -180, 180) !== null;
}

export async function searchWeatherLocations(query, config) {
  const name = String(query || '').trim();
  if (name.length < 2 || name.length > 120) return [];
  const url = new URL('/v1/search', config.weatherGeocodingBaseUrl);
  url.searchParams.set('name', name);
  url.searchParams.set('count', '8');
  url.searchParams.set('language', 'ru');
  url.searchParams.set('format', 'json');
  const body = await fetchJson(url, { timeoutMs:config.weatherFetchTimeoutMs });
  return (Array.isArray(body?.results) ? body.results : []).map((item) => ({
    name:item.name || '',
    admin1:item.admin1 || '',
    country:item.country || '',
    latitude:Number(item.latitude),
    longitude:Number(item.longitude),
    timezone:item.timezone || 'auto'
  })).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
}

function providerOrder(config) {
  const requested = Array.isArray(config.weatherProviderOrder) ? config.weatherProviderOrder : [];
  const valid = requested.filter((provider, index) => PROVIDERS[provider] && requested.indexOf(provider) === index);
  return valid.length ? valid : ['met-no','open-meteo'];
}

function fresh(record) {
  return Boolean(record?.snapshot && Date.parse(record.fresh_until) > Date.now());
}

function providerError(error) {
  if (!error) return 'Неизвестная ошибка погодного провайдера.';
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return 'Превышено время ожидания ответа.';
  return String(error.message || error).slice(0, 2000);
}

function decorate(record, settings, { stale = false } = {}) {
  if (!record?.snapshot) return null;
  return Object.freeze({
    ...record.snapshot,
    location_name:String(settings?.location_name || record.location_name || '').trim(),
    timezone:cityTimezone(settings?.timezone, record.timezone || record.snapshot.timezone || 'UTC'),
    provider:record.provider,
    provider_updated_at:record.fetched_at,
    fetched_at:record.fetched_at,
    stale
  });
}

export class WeatherService {
  constructor({ store, config, logger = console }) {
    this.store = store;
    this.config = config;
    this.logger = logger;
    this.inFlight = new Map();
    this.timer = null;
  }

  async event({ action, severity, message, provider = null, details = '', metadata = {} }) {
    if (typeof this.store?.recordActivity !== 'function') return;
    try {
      await this.store.recordActivity({
        actor_username:'system',
        action,
        entity_type:provider ? 'weather_provider' : 'weather_system',
        entity_id:provider,
        message,
        severity,
        category:'weather',
        details,
        metadata
      });
    } catch (error) {
      this.logger.warn?.('Weather event could not be recorded', { error });
    }
  }

  async setProviderState(provider, status, error = '', cooldownUntil = null) {
    if (typeof this.store?.setWeatherProviderStatus !== 'function') return null;
    const transition = await this.store.setWeatherProviderStatus({
      provider, status, error, cooldownUntil
    });
    if (transition?.previous?.status === status) return transition.current;
    const label = PROVIDERS[provider]?.label || provider;
    if (status === 'failed') {
      await this.event({
        action:'weather.provider.failed',
        severity:'warning',
        provider,
        message:`${label} недоступен. MIRA-TV переключается на резервный источник.`,
        details:error
      });
    } else if (status === 'healthy' && transition?.previous?.status === 'failed') {
      await this.event({
        action:'weather.provider.recovered',
        severity:'info',
        provider,
        message:`${label} снова доступен.`
      });
    }
    return transition.current;
  }

  async setSystemState(status, details = '') {
    if (typeof this.store?.setWeatherProviderStatus !== 'function') return;
    const transition = await this.store.setWeatherProviderStatus({
      provider:'weather-system',
      status,
      error:details,
      cooldownUntil:null
    });
    if (transition?.previous?.status === status) return;
    if (status === 'failed') {
      await this.event({
        action:'weather.system.failed',
        severity:'error',
        message:'Все погодные источники недоступны. Используются последние сохранённые данные.',
        details
      });
    } else if (status === 'healthy' && transition?.previous?.status === 'failed') {
      await this.event({
        action:'weather.system.recovered',
        severity:'info',
        message:'Получение свежих погодных данных восстановлено.'
      });
    }
  }

  async providerAvailable(provider) {
    const status = await this.store.getWeatherProviderStatus?.(provider);
    return !(status?.status === 'failed' && status.cooldown_until && Date.parse(status.cooldown_until) > Date.now());
  }

  async fetchFromProviders(settings) {
    const failures = [];
    for (const provider of providerOrder(this.config)) {
      if (!await this.providerAvailable(provider)) continue;
      try {
        const snapshot = await PROVIDERS[provider].fetch(settings, this.config);
        await this.setProviderState(provider, 'healthy');
        await this.setSystemState('healthy');
        return { provider, snapshot };
      } catch (error) {
        const message = providerError(error);
        failures.push(`${PROVIDERS[provider].label}: ${message}`);
        const cooldownUntil = new Date(Date.now() + this.config.weatherProviderCooldownSeconds * 1000).toISOString();
        await this.setProviderState(provider, 'failed', message, cooldownUntil);
      }
    }
    await this.setSystemState('failed', failures.join('\n'));
    const error = new Error(failures.length ? failures.join('; ') : 'Нет доступных погодных провайдеров.');
    error.code = 'WEATHER_PROVIDERS_UNAVAILABLE';
    throw error;
  }

  async refresh(settings, existing = null) {
    const key = weatherSourceKey(settings);
    if (this.inFlight.has(key)) return this.inFlight.get(key);
    const task = (async () => {
      try {
        const { provider, snapshot } = await this.fetchFromProviders(settings);
        const now = new Date();
        const saved = await this.store.upsertWeatherSnapshotRecord({
          source_key:key,
          location_name:String(settings?.location_name || '').trim(),
          ...weatherCoordinates(settings),
          timezone:cityTimezone(settings?.timezone, snapshot.timezone || 'UTC'),
          provider,
          snapshot,
          fetched_at:now.toISOString(),
          fresh_until:new Date(now.getTime() + this.config.weatherCacheSeconds * 1000).toISOString()
        });
        return decorate(saved, settings);
      } catch (error) {
        if (existing?.snapshot) return decorate(existing, settings, { stale:true });
        throw error;
      }
    })().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, task);
    return task;
  }

  async getSnapshot(settings, { force = false } = {}) {
    if (!hasWeatherCoordinates(settings)) throw new Error('Weather coordinates are not configured.');
    const key = weatherSourceKey(settings);
    const stored = await this.store.getWeatherSnapshotRecord(key);
    if (!force && fresh(stored)) return decorate(stored, settings);
    if (!force && stored?.snapshot) {
      void this.refresh(settings, stored).catch((error) => {
        this.logger.warn?.('Weather background refresh failed', { error });
      });
      return decorate(stored, settings, { stale:true });
    }
    return this.refresh(settings, stored);
  }

  async refreshConfiguredSources() {
    if (typeof this.store?.listWeatherSceneDocuments !== 'function') return;
    const documents = await this.store.listWeatherSceneDocuments();
    const unique = new Map();
    for (const document of documents) {
      const settings = sceneWeatherSettings(document.scene, document.screen_id);
      if (!settings?.enabled || !hasWeatherCoordinates(settings)) continue;
      unique.set(weatherSourceKey(settings), settings);
    }
    for (const settings of unique.values()) {
      try {
        const record = await this.store.getWeatherSnapshotRecord(weatherSourceKey(settings));
        if (!fresh(record)) await this.refresh(settings, record);
      } catch (error) {
        this.logger.warn?.('Weather collector refresh failed', {
          location:settings.location_name,
          error
        });
      }
    }
  }

  start() {
    if (this.timer) return;
    void this.refreshConfiguredSources();
    this.timer = setInterval(
      () => void this.refreshConfiguredSources(),
      this.config.weatherCollectorIntervalSeconds * 1000
    );
    this.timer.unref?.();
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}

export function createWeatherService(dependencies) {
  return new WeatherService(dependencies);
}
