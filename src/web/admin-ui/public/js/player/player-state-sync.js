import { createPlayerRealtimeClient } from './player-realtime-client.js';
import { fetchWithTimeout } from './fetch-timeout.js';
import {
  acknowledgePlayerLogs,
  appendPlayerLog,
  clearAssetManifests,
  clearLastKnownGood,
  commitAssetManifest,
  loadAssetManifests,
  loadLastKnownGood,
  loadPreviousKnownGood,
  openPlayerStore,
  pendingPlayerLogs,
  saveLastKnownGood,
  stageAssetManifest
} from './player-store.js';

const ALL_COMPONENTS = Object.freeze([
  'screen', 'menu', 'scene', 'animation', 'scene_playlist', 'content_manifest', 'runtime'
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

function enabledSceneMedia(context) {
  return Array.isArray(context?.scene?.elements)
    ? context.scene.elements.filter((element) =>
        element?.enabled !== false
        && ['image', 'logo', 'video'].includes(element?.type)
        && localAsset(element?.media?.source_url)
      )
    : [];
}

function activeAssetManifest(context, revision = '') {
  const supplied = context?.content_manifest;
  if (supplied && Array.isArray(supplied.assets)) {
    const assets = supplied.assets
      .map((asset) => {
        const url = localAsset(asset?.url);
        return url ? { ...asset, url } : null;
      })
      .filter(Boolean);
    return {
      version:Number(supplied.version) || 1,
      revision:String(supplied.revision || revision || context?.revision || ''),
      assets
    };
  }

  const sceneAssets = enabledSceneMedia(context).map((element) => element.media.source_url);
  const assets = [
    context?.draft?.settings?.background_image_url,
    ...sceneAssets
  ].map(localAsset).filter(Boolean);
  return {
    version:1,
    revision:String(revision || context?.revision || ''),
    assets:[...new Set(assets)].map((url) => ({ url, required:true }))
  };
}

async function requireAsset(url) {
  const response = await fetch(url, {
    cache: 'force-cache',
    credentials: 'include'
  });
  if (!response.ok) throw new Error(`Critical Player asset unavailable: HTTP ${response.status}`);
}

const localFirstWorkerProtocols = new WeakMap();
const unsupportedLocalFirstWorkers = new WeakSet();

async function activePlayerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  if (typeof navigator.serviceWorker.getRegistration === 'function') {
    try {
      const registration = await navigator.serviceWorker.getRegistration('/player');
      if (registration?.active) return registration.active;
    } catch {}
  }
  return navigator.serviceWorker.controller || null;
}

function postWorkerRequest(target, message, timeoutMs) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error('Player asset cache operation timed out.'));
    }, timeoutMs);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(event.data || null);
    };
    target.postMessage(message, [channel.port2]);
  });
}

async function localFirstProtocol(target) {
  if (localFirstWorkerProtocols.has(target)) return localFirstWorkerProtocols.get(target);
  if (unsupportedLocalFirstWorkers.has(target)) return 0;
  try {
    const result = await postWorkerRequest(target, { type:'mira:player-cache-capabilities' }, 350);
    const protocol = result?.local_first === true ? Math.max(0, Number(result?.protocol || 0)) : 0;
    if (protocol >= 1) localFirstWorkerProtocols.set(target, protocol);
    else unsupportedLocalFirstWorkers.add(target);
    return protocol;
  } catch {
    unsupportedLocalFirstWorkers.add(target);
    return 0;
  }
}

async function serviceWorkerRequest(message, timeoutMs = 10 * 60_000, minimumProtocol = 1) {
  if (typeof MessageChannel !== 'function') return null;
  const target = await activePlayerServiceWorker();
  if (!target || await localFirstProtocol(target) < minimumProtocol) return null;
  return postWorkerRequest(target, message, timeoutMs);
}

async function stageCandidateAssets(context, metadata) {
  const manifest = activeAssetManifest(context, metadata?.revision);
  await stageAssetManifest(manifest);
  const workerResult = await serviceWorkerRequest({ type:'mira:player-stage-assets', manifest });
  if (workerResult) {
    if (workerResult.ok !== true) {
      const error = new Error(`Player asset staging incomplete: ${workerResult.failed?.length || 0} asset(s) unavailable.`);
      error.failedAssets = workerResult.failed || [];
      throw error;
    }
    return manifest;
  }

  await Promise.all(manifest.assets.map((asset) => requireAsset(asset.url)));
  return manifest;
}

async function commitCandidateAssets(manifest) {
  const manifests = await commitAssetManifest(manifest);
  await serviceWorkerRequest({
    type:'mira:player-commit-assets',
    active:manifests.active,
    previous:manifests.previous
  }, 30_000).catch(() => undefined);
  return manifests;
}

function publishActiveAssets(context) {
  if (!('serviceWorker' in navigator)) return;
  const manifest = activeAssetManifest(context);
  const message = { type: 'mira:player-active-assets', assets: manifest.assets.map((asset) => asset.url) };
  void activePlayerServiceWorker()
    .then((target) => target?.postMessage(message))
    .catch(() => undefined);
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


function manifestBytes(manifest) {
  const seen = new Set();
  let total = 0;
  for (const asset of Array.isArray(manifest?.assets) ? manifest.assets : []) {
    const url = String(asset?.url || '');
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const size = Number(asset?.size_bytes);
    if (Number.isSafeInteger(size) && size >= 0) total += size;
  }
  return total;
}

function retainedManifestBytes(manifests) {
  const sizes = new Map();
  for (const manifest of [manifests?.active, manifests?.previous, manifests?.staging]) {
    for (const asset of Array.isArray(manifest?.assets) ? manifest.assets : []) {
      const url = String(asset?.url || '');
      const size = Number(asset?.size_bytes);
      if (!url || sizes.has(url) || !Number.isSafeInteger(size) || size < 0) continue;
      sizes.set(url, size);
    }
  }
  let total = 0;
  for (const size of sizes.values()) total += size;
  return total;
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
  let diagnosticSequence = 0;
  let websocketConnected = false;
  let cacheReportPromise = null;
  let lastCacheCommand = null;
  const currentBootId = bootId();
  const diagnosticBootId = `${currentBootId.slice(0, 57)}-diag`;
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

  function diagnosticData(error, extra = {}) {
    const message = String(error?.message || '').slice(0, 180);
    return {
      ...extra,
      kind: String(error?.name || 'Error').slice(0, 48),
      ...(message ? { message } : {})
    };
  }

  function reportDiagnostic(type, data = {}, level = 'warn') {
    diagnosticSequence += 1;
    const event = {
      seq: diagnosticSequence,
      level,
      type,
      revision: active?.revision || '',
      device_timestamp: new Date().toISOString(),
      data
    };
    void fetch('/api/device/player-logs', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ boot_id: diagnosticBootId, events: [event] })
    }).catch(() => undefined);
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
          credentials: 'include',
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

  async function cacheStatusSnapshot() {
    const manifests = await loadAssetManifests().catch(() => ({ active:null, previous:null, staging:null }));
    const worker = await activePlayerServiceWorker();
    const protocol = worker ? await localFirstProtocol(worker) : 0;
    const inspection = protocol >= 2
      ? await serviceWorkerRequest({
          type:'mira:player-cache-inspect',
          active:manifests.active,
          previous:manifests.previous,
          staging:manifests.staging
        }, 15_000, 2).catch(() => null)
      : null;

    const estimate = typeof navigator.storage?.estimate === 'function'
      ? await navigator.storage.estimate().catch(() => ({}))
      : {};
    const persisted = typeof navigator.storage?.persisted === 'function'
      ? await navigator.storage.persisted().catch(() => null)
      : null;
    const activeAssets = Array.isArray(manifests.active?.assets) ? manifests.active.assets.length : 0;

    return {
      reported_at:new Date().toISOString(),
      local_first:protocol >= 1,
      service_worker_active:Boolean(worker),
      active_revision:String(manifests.active?.revision || ''),
      previous_revision:String(manifests.previous?.revision || ''),
      staging_revision:String(manifests.staging?.revision || ''),
      active_assets:Number.isSafeInteger(Number(inspection?.active_assets)) ? Number(inspection.active_assets) : activeAssets,
      cached_assets:Number.isSafeInteger(Number(inspection?.cached_assets)) ? Number(inspection.cached_assets) : null,
      missing_assets:Number.isSafeInteger(Number(inspection?.missing_assets)) ? Number(inspection.missing_assets) : null,
      retained_assets:Number.isSafeInteger(Number(inspection?.retained_assets)) ? Number(inspection.retained_assets) : null,
      unused_assets:Number.isSafeInteger(Number(inspection?.unused_assets)) ? Number(inspection.unused_assets) : null,
      active_bytes:manifestBytes(manifests.active),
      retained_bytes:retainedManifestBytes(manifests),
      storage_usage_bytes:Number.isSafeInteger(Number(estimate?.usage)) ? Number(estimate.usage) : null,
      storage_quota_bytes:Number.isSafeInteger(Number(estimate?.quota)) ? Number(estimate.quota) : null,
      storage_persisted:typeof persisted === 'boolean' ? persisted : null,
      last_command_id:lastCacheCommand?.id || '',
      last_command_action:lastCacheCommand?.action || '',
      last_command_ok:typeof lastCacheCommand?.ok === 'boolean' ? lastCacheCommand.ok : null,
      last_command_message:lastCacheCommand?.message || '',
      last_command_completed_at:lastCacheCommand?.completedAt || null
    };
  }

  async function reportCacheStatus() {
    if (!navigator.onLine) return null;
    if (cacheReportPromise) return cacheReportPromise;
    cacheReportPromise = (async () => {
      const status = await cacheStatusSnapshot();
      const response = await fetch('/api/device/cache-status', {
        method:'POST',
        credentials:'include',
        cache:'no-store',
        headers:{ 'content-type':'application/json' },
        body:JSON.stringify(status)
      });
      if (response.status === 401 || response.status === 403) return null;
      if (!response.ok) throw new Error(`Player cache status HTTP ${response.status}`);
      return status;
    })().catch(() => null).finally(() => {
      cacheReportPromise = null;
    });
    return cacheReportPromise;
  }

  async function runCacheCommand(message) {
    const action = String(message?.action || '');
    const requestId = String(message?.request_id || '').slice(0, 80);
    if (!['check', 'cleanup-unused', 'redownload-active'].includes(action) || !requestId) return;

    let ok = true;
    let detail = '';
    try {
      const manifests = await loadAssetManifests();
      if (action === 'cleanup-unused') {
        const result = await serviceWorkerRequest({
          type:'mira:player-cache-cleanup',
          active:manifests.active,
          previous:manifests.previous,
          staging:manifests.staging
        }, 30_000, 2);
        if (!result) throw new Error('Управление локальным кэшем недоступно на этом Player.');
        if (result.ok !== true) throw new Error('Не удалось очистить неиспользуемый кэш.');
        detail = result.removed > 0 ? `Удалено файлов: ${result.removed}.` : 'Неиспользуемых файлов нет.';
      } else if (action === 'redownload-active') {
        if (!manifests.active) throw new Error('Активная локальная ревизия ещё не создана.');
        const result = await serviceWorkerRequest({
          type:'mira:player-cache-redownload',
          active:manifests.active,
          previous:manifests.previous,
          staging:manifests.staging
        }, 10 * 60_000, 2);
        if (!result) throw new Error('Управление локальным кэшем недоступно на этом Player.');
        if (result.ok !== true) throw new Error(`Не удалось перескачать ${result.failed?.length || 0} файлов.`);
        detail = `Перескачано файлов: ${result.fetched || 0}.`;
      } else {
        detail = 'Кэш проверен.';
      }
    } catch (error) {
      ok = false;
      detail = String(error?.message || 'Команда кэша не выполнена.').slice(0, 180);
    }

    lastCacheCommand = {
      id:requestId,
      action,
      ok,
      message:detail,
      completedAt:new Date().toISOString()
    };
    log('cache.command.completed', { action, ok }, ok ? 'info' : 'warn');
    await reportCacheStatus();
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
    let degradedAssetError = null;
    let stagedManifest = null;
    try {
      stagedManifest = await stageCandidateAssets(context, metadata);
    } catch (error) {
      if (active?.context) {
        error.miraPhase = 'critical-assets';
        throw error;
      }
      degradedAssetError = error;
      console.warn('MIRA-TV first boot continues without fully staged critical assets', error);
      reportDiagnostic('asset.preload.degraded', diagnosticData(error, {
        source,
        phase:'critical-assets',
        failed_assets:Array.isArray(error?.failedAssets) ? error.failedAssets.length : undefined
      }));
    }

    try {
      await prepareAssets?.(context, changedNames);
    } catch (error) {
      error.miraPhase = 'prepare-assets';
      throw error;
    }

    try {
      await applyContext(context, changedNames, { source });
    } catch (error) {
      error.miraPhase = 'render';
      throw error;
    }

    active = {
      schema_version: metadata.schema_version,
      revision: metadata.revision,
      hashes: metadata.hashes,
      context
    };
    updateRuntime(context);

    try {
      await persistLastKnownGood();
      if (stagedManifest && !degradedAssetError) await commitCandidateAssets(stagedManifest);
      else publishActiveAssets(context);
      onLastKnownGood?.(context);
    } catch (error) {
      console.warn('MIRA-TV could not persist Local-first Player state', error);
    }

    log('state.applied', {
      source,
      changed: changedNames.slice(0, 12),
      degraded_assets: Boolean(degradedAssetError),
      local_first: Boolean(stagedManifest && !degradedAssetError)
    });
    void reportCacheStatus();
    void warmAssets?.(context, changedNames);
  }

  async function fetchDelta() {
    const response = await fetchWithTimeout('/api/device/player-delta', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schema_version: active?.schema_version || 0,
        hashes: active?.hashes || {}
      })
    }, 5000);
    if (response.status === 401 || response.status === 403) return { unauthorized: true };
    if (!response.ok) throw new Error(`Player delta failed: HTTP ${response.status}`);
    return { body: await response.json() };
  }

  async function performSync(reason) {
    try {
      const result = await fetchDelta();
      if (result.unauthorized) {
        stop();
        await clearLastKnownGood().catch(() => undefined);
        await clearAssetManifests().catch(() => undefined);
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
      const phase = String(error?.miraPhase || 'player-delta');
      const data = diagnosticData(error, { reason, phase });
      log('sync.failed', data, 'warn');
      reportDiagnostic('sync.failed', data, 'warn');
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
    onCacheCommand(message) {
      void runCacheCommand(message);
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

  async function restoreStoredRecord(record, source, manifests) {
    if (!record) return false;
    active = record;
    updateRuntime(record.context);
    await applyContext(record.context, [...ALL_COMPONENTS], { source });
    if (manifests?.active) {
      void serviceWorkerRequest({
        type:'mira:player-commit-assets',
        active:manifests.active,
        previous:manifests.previous
      }, 30_000).catch(() => undefined);
    } else {
      publishActiveAssets(record.context);
    }
    onLastKnownGood?.(record.context);
    log('state.restored', { saved:true, source });
    void reportCacheStatus();
    onConnectivity?.('offline');
    return true;
  }

  async function restoreLastKnownGood() {
    await openPlayerStore().catch(() => null);
    const manifests = await loadAssetManifests().catch(() => ({ active:null, previous:null }));
    const current = stateFromRecord(await loadLastKnownGood().catch(() => null));
    try {
      if (await restoreStoredRecord(current, 'last-known-good', manifests)) return true;
    } catch (error) {
      console.warn('MIRA-TV active Last Known Good state could not be restored', error);
    }

    const previous = stateFromRecord(await loadPreviousKnownGood().catch(() => null));
    try {
      if (await restoreStoredRecord(previous, 'previous-known-good', manifests)) {
        reportDiagnostic('state.rollback.previous', { revision:previous.revision }, 'warn');
        return true;
      }
    } catch (error) {
      console.warn('MIRA-TV previous Last Known Good state could not be restored', error);
    }
    active = null;
    return false;
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
    await clearAssetManifests().catch(() => undefined);
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
