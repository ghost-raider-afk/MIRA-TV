import { createPlayerRealtimeClient } from './player-realtime-client.js';
import {
  acknowledgePlayerLogs,
  appendPlayerLog,
  clearLastKnownGood,
  loadLastKnownGood,
  openPlayerStore,
  pendingPlayerLogs,
  saveLastKnownGood
} from './player-store.js';

const ALL_COMPONENTS = Object.freeze([
  'screen', 'menu', 'animation', 'environment', 'scene_playlist',
  'entity', 'brand', 'announcement', 'runtime'
]);
const DEFAULT_FALLBACK_POLL_MS = 60_000;
const DEFAULT_LOG_BATCH_SIZE = 100;
const DEFAULT_LOG_MAX_ENTRIES = 5000;
const DEFAULT_LOG_MAX_BYTES = 10 * 1024 * 1024;
const MAX_LOG_BATCHES_PER_FLUSH = 4;

function bootId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `boot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function stateFromRecord(record) {
  if (!record?.context || typeof record.context !== 'object') return null;
  const schemaVersion = Number(record.schema_version ?? record.context.schema_version);
  const hashes = record.hashes && typeof record.hashes === 'object' ? record.hashes : record.context.hashes;
  return {
    schema_version: Number.isSafeInteger(schemaVersion) ? schemaVersion : 0,
    revision: String(record.revision || record.context.revision || ''),
    hashes: hashes && typeof hashes === 'object' && !Array.isArray(hashes) ? hashes : {},
    context: record.context
  };
}

function mergeDelta(context, changed, metadata) {
  const next = { ...(context || {}) };
  for (const [name, value] of Object.entries(changed || {})) {
    if (name === 'menu') {
      next.draft = value?.draft || { rows: [], settings: {}, revision: 0 };
      next.products = value?.products || [];
      next.packaging = value?.packaging || [];
    } else if (name === 'runtime') {
      Object.assign(next, value || {});
    } else {
      next[name] = value;
    }
  }
  next.schema_version = metadata.schema_version;
  next.revision = metadata.revision;
  next.hashes = metadata.hashes;
  return next;
}

function localAsset(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text, location.origin);
    if (url.origin !== location.origin || !url.pathname.startsWith('/site-assets/')) return '';
    return url.href;
  } catch {
    return '';
  }
}

function activeAssetManifest(context) {
  const assets = [
    context?.draft?.settings?.background_image_url,
    context?.entity?.asset_url,
    context?.entity?.poster_url
  ].map(localAsset).filter(Boolean);
  return [...new Set(assets)];
}

async function prepareCriticalAssets(context, changedNames) {
  const dirty = new Set(changedNames || []);
  if (!dirty.has('menu') && !dirty.has('screen')) return;
  const background = localAsset(context?.draft?.settings?.background_image_url);
  if (!background) return;
  const response = await fetch(background, { cache: 'force-cache', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Critical Player background unavailable: HTTP ${response.status}`);
}

function publishActiveAssets(context) {
  if (!('serviceWorker' in navigator)) return;
  const message = { type: 'mira:player-active-assets', assets: activeAssetManifest(context) };
  void navigator.serviceWorker.ready.then((registration) => {
    const target = navigator.serviceWorker.controller || registration.active;
    target?.postMessage(message);
  }).catch(() => undefined);
}

function publicLogRecord(record) {
  return {
    seq: record.seq,
    level: record.level,
    type: record.type,
    revision: record.revision || '',
    device_timestamp: record.device_timestamp || null,
    data: record.data || {}
  };
}

export function createPlayerStateSync({
  applyContext,
  prepareAssets,
  warmAssets,
  onLastKnownGood,
  onUnauthorized,
  onConnectivity
} = {}) {
  if (typeof applyContext !== 'function') throw new TypeError('applyContext is required');

  let active = null;
  let started = false;
  let fallbackTimer = null;
  let syncPromise = null;
  let syncQueued = false;
  let logFlushPromise = null;
  let logFlushTimer = null;
  let logFlushNeeded = true;
  let sequence = 0;
  let websocketConnected = false;
  const currentBootId = bootId();
  let runtime = {
    fallbackPollMs: DEFAULT_FALLBACK_POLL_MS,
    logBatchSize: DEFAULT_LOG_BATCH_SIZE,
    logMaxEntries: DEFAULT_LOG_MAX_ENTRIES,
    logMaxBytes: DEFAULT_LOG_MAX_BYTES
  };

  function updateRuntime(context) {
    const previousFallbackPollMs = runtime.fallbackPollMs;
    runtime = {
      fallbackPollMs: positiveInteger(context?.fallback_poll_interval_ms, DEFAULT_FALLBACK_POLL_MS),
      logBatchSize: positiveInteger(context?.log_batch_size, DEFAULT_LOG_BATCH_SIZE),
      logMaxEntries: positiveInteger(context?.log_local_max_entries, DEFAULT_LOG_MAX_ENTRIES),
      logMaxBytes: positiveInteger(context?.log_local_max_bytes, DEFAULT_LOG_MAX_BYTES)
    };
    if (started && !websocketConnected && previousFallbackPollMs !== runtime.fallbackPollMs) {
      clearFallbackTimer();
      scheduleFallbackPoll();
    }
  }

  function log(type, data = {}, level = 'info') {
    sequence += 1;
    logFlushNeeded = true;
    void appendPlayerLog({
      boot_id: currentBootId,
      seq: sequence,
      level,
      type,
      revision: active?.revision || '',
      device_timestamp: new Date().toISOString(),
      data
    }, {
      maxEntries: runtime.logMaxEntries,
      maxBytes: runtime.logMaxBytes
    }).catch(() => undefined);
  }

  function clearFallbackTimer() {
    if (fallbackTimer) clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }

  function clearLogFlushTimer() {
    if (logFlushTimer) clearTimeout(logFlushTimer);
    logFlushTimer = null;
  }

  function scheduleFallbackPoll() {
    if (!started || websocketConnected || fallbackTimer) return;
    fallbackTimer = setTimeout(async () => {
      fallbackTimer = null;
      if (!started || websocketConnected) return;
      await syncNow('fallback').catch(() => undefined);
      scheduleFallbackPoll();
    }, runtime.fallbackPollMs);
  }

  function scheduleLogFlush(delay = 1500) {
    clearLogFlushTimer();
    if (!started || !navigator.onLine || !logFlushNeeded) return;
    logFlushTimer = setTimeout(() => {
      logFlushTimer = null;
      void flushLogs();
    }, delay);
  }

  async function flushLogs() {
    if (logFlushPromise || !navigator.onLine || !logFlushNeeded) return logFlushPromise;
    logFlushPromise = (async () => {
      for (let index = 0; index < MAX_LOG_BATCHES_PER_FLUSH; index += 1) {
        const pending = await pendingPlayerLogs(runtime.logBatchSize);
        if (!pending.length) {
          logFlushNeeded = false;
          return;
        }
        const batchBootId = pending[0].boot_id;
        const batch = pending.filter((record) => record.boot_id === batchBootId);
        const response = await fetch('/api/device/player-logs', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ boot_id: batchBootId, events: batch.map(publicLogRecord) })
        });
        if (response.status === 401 || response.status === 403) return;
        if (!response.ok) throw new Error(`Player log upload failed: HTTP ${response.status}`);
        const body = await response.json();
        await acknowledgePlayerLogs(batchBootId, body.accepted_through);
      }
      scheduleLogFlush(2000);
    })().catch(() => undefined).finally(() => {
      logFlushPromise = null;
    });
    return logFlushPromise;
  }

  async function persistLastKnownGood() {
    if (!active?.context) return;
    await saveLastKnownGood({
      schema_version: active.schema_version,
      revision: active.revision,
      hashes: active.hashes,
      screen_id: active.context.screen?.id || null,
      saved_at: new Date().toISOString(),
      context: active.context
    });
  }

  async function applyCandidate(context, metadata, changedNames, source) {
    await prepareCriticalAssets(context, changedNames);
    await prepareAssets?.(context, changedNames);
    await applyContext(context, changedNames, { source });

    active = {
      schema_version: metadata.schema_version,
      revision: metadata.revision,
      hashes: metadata.hashes,
      context
    };
    updateRuntime(context);

    try {
      await persistLastKnownGood();
      publishActiveAssets(context);
      onLastKnownGood?.(context);
    } catch (error) {
      console.warn('MIRA-TV could not persist Last Known Good state', error);
    }

    log('state.applied', { source, changed: changedNames.slice(0, 12) });
    void warmAssets?.(context, changedNames);
  }

  async function fetchDelta() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('/api/device/player-delta', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          schema_version: active?.schema_version || 0,
          hashes: active?.hashes || {}
        })
      });
      if (response.status === 401 || response.status === 403) return { unauthorized: true };
      if (!response.ok) throw new Error(`Player delta failed: HTTP ${response.status}`);
      return { body: await response.json() };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function performSync(reason) {
    try {
      const result = await fetchDelta();
      if (result.unauthorized) {
        stop();
        await clearLastKnownGood().catch(() => undefined);
        active = null;
        onUnauthorized?.();
        return { ok: false, unauthorized: true, hasContext: false };
      }

      const body = result.body || {};
      if (body.full_snapshot_required) {
        const context = body.context;
        const metadata = {
          schema_version: Number(context?.schema_version) || 0,
          revision: String(context?.revision || ''),
          hashes: context?.hashes || {}
        };
        await applyCandidate(context, metadata, [...ALL_COMPONENTS], reason === 'boot' ? 'snapshot' : reason);
        onConnectivity?.('online');
        void flushLogs();
        return { ok: true, changed: true, hasContext: true };
      }

      const metadata = {
        schema_version: Number(body.schema_version) || active?.schema_version || 0,
        revision: String(body.revision || active?.revision || ''),
        hashes: body.hashes || active?.hashes || {}
      };
      const changedNames = Object.keys(body.changed || {});
      if (body.unchanged || changedNames.length === 0) {
        if (active) active = { ...active, ...metadata };
        onConnectivity?.('online');
        void flushLogs();
        return { ok: true, changed: false, hasContext: Boolean(active?.context) };
      }

      const context = mergeDelta(active?.context, body.changed, metadata);
      await applyCandidate(context, metadata, changedNames, reason);
      onConnectivity?.('online');
      void flushLogs();
      return { ok: true, changed: true, hasContext: true };
    } catch (error) {
      if (error?.name !== 'AbortError') console.warn('MIRA-TV Player synchronization failed', error);
      log('sync.failed', { reason, kind: error?.name || 'Error' }, 'warn');
      if (!navigator.onLine) onConnectivity?.('offline');
      else if (active?.context) onConnectivity?.('degraded');
      return { ok: false, unauthorized: false, hasContext: Boolean(active?.context), error };
    }
  }

  async function syncNow(reason = 'manual') {
    if (syncPromise) {
      syncQueued = true;
      return syncPromise;
    }
    syncPromise = performSync(reason).finally(() => {
      syncPromise = null;
      if (syncQueued) {
        syncQueued = false;
        void syncNow('coalesced');
      }
    });
    return syncPromise;
  }

  const realtime = createPlayerRealtimeClient({
    onChanged(message) {
      if (message?.revision && message.revision === active?.revision) return;
      void syncNow('websocket-change');
    },
    onConnected() {
      const wasConnected = websocketConnected;
      websocketConnected = true;
      clearFallbackTimer();
      if (!wasConnected) log('websocket.connected');
      onConnectivity?.('online');
      void syncNow('websocket-reconcile');
      void flushLogs();
    },
    onDisconnected() {
      const wasConnected = websocketConnected;
      websocketConnected = false;
      if (wasConnected) log('websocket.disconnected', {}, 'warn');
      if (!navigator.onLine) onConnectivity?.('offline');
      scheduleFallbackPoll();
    }
  });

  async function restoreLastKnownGood() {
    try {
      await openPlayerStore();
      const record = stateFromRecord(await loadLastKnownGood());
      if (!record) return false;
      active = record;
      updateRuntime(record.context);
      await applyContext(record.context, [...ALL_COMPONENTS], { source: 'last-known-good' });
      publishActiveAssets(record.context);
      onLastKnownGood?.(record.context);
      log('state.restored', { saved: true });
      onConnectivity?.('offline');
      return true;
    } catch (error) {
      console.warn('MIRA-TV Last Known Good state is unavailable', error);
      return false;
    }
  }

  function start() {
    if (started) return;
    started = true;
    realtime.start();
    scheduleFallbackPoll();
    scheduleLogFlush(250);
  }

  function stop() {
    if (!started && !fallbackTimer && !logFlushTimer) return;
    started = false;
    websocketConnected = false;
    clearFallbackTimer();
    clearLogFlushTimer();
    realtime.stop();
  }

  async function reset() {
    stop();
    active = null;
    await clearLastKnownGood().catch(() => undefined);
  }

  function note(type, data = {}, level = 'info') {
    log(type, data, level);
    if (started && navigator.onLine) scheduleLogFlush(250);
  }

  return Object.freeze({
    restoreLastKnownGood,
    syncNow,
    start,
    stop,
    reset,
    note,
    flushLogs,
    get hasContext() { return Boolean(active?.context); },
    get revision() { return active?.revision || ''; },
    get connected() { return websocketConnected; },
    get context() { return active?.context || null; }
  });
}
