const RETIRED_SHELL_CACHE = 'mira-tv-player-shell-v48';
const LEGACY_SHELL_CACHE = 'mira-tv-player-shell-v42';
const SHELL_CACHE = 'mira-tv-player-shell-v49';
const DATA_CACHE = 'mira-tv-player-data-v18';
// Source revision: Local-first cache management and atomic content staging.
const SHELL_ASSETS = [
  '/player.html',
  '/player.webmanifest',
  '/brand/player-icon-192.png',
  '/brand/player-icon-512.png',
  '/css/fonts.css',
  '/fonts/DejaVuSans.ttf',
  '/fonts/DejaVuSans-Bold.ttf',
  '/fonts/DejaVuSansCondensed.ttf',
  '/fonts/DejaVuSansCondensed-Bold.ttf',
  '/fonts/DejaVuSerif.ttf',
  '/fonts/DejaVuSerif-Bold.ttf',
  '/fonts/DejaVuSansMono.ttf',
  '/fonts/DejaVuSansMono-Bold.ttf',
  '/fonts/DejaVuSerifCondensed.ttf',
  '/fonts/DejaVuSerifCondensed-Bold.ttf',
  '/css/player.css',
  '/css/player-scene.css',
  '/css/weather-widget.css',
  '/css/scene-playlist.css',
  '/js/player/player.js',
  '/js/core/dom-compat.js',
  '/js/player/player-boot.js',
  '/js/player/fetch-timeout.js',
  '/js/player/player-preview-capture.js',
  '/js/player/player-metrics.js',
  '/js/player/player-scene-renderer.js',
  '/js/player/scene-element-renderer.js',
  '/js/player/player-store.js',
  '/js/player/player-realtime-client.js',
  '/js/player/player-state-sync.js',
  '/js/player/weather-bootstrap.js',
  '/js/player/flat-menu-renderer.js',
  '/js/player/scene-layer-composer.js',
  '/js/editor/renderer.js',
  '/js/editor/renderer-model.js',
  '/js/editor/renderer-svg.js',
  '/js/motion/weather-widget.js',
  '/js/motion/scene-playlist-runtime.js',
  '/js/motion/scene-motion-runtime.js',
  '/js/motion/scene-visibility.js',
  '/js/motion/motion-plan.js',
  '/js/motion/dom-scene-adapter.js',
  '/js/motion/scene-graph.js',
  '/js/motion/scene-composer.js',
  '/js/motion/scene-runtime.js',
  '/js/motion/timeline.js',
  '/js/motion/drivers/waapi-driver.js',
  '/js/motion/drivers/wasm-motion-driver.js',
  '/js/motion/wasm-motion-kernel.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await Promise.all([
      caches.delete(RETIRED_SHELL_CACHE),
      caches.delete(LEGACY_SHELL_CACHE)
    ]);
    const keep = new Set([SHELL_CACHE, DATA_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('mira-tv-player-') && !keep.has(name)).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

function manifestAssetSet(manifest) {
  const values = Array.isArray(manifest)
    ? manifest
    : Array.isArray(manifest?.assets)
      ? manifest.assets.map((asset) => typeof asset === 'string' ? asset : asset?.url)
      : [];
  const assets = new Set();
  for (const value of values) {
    try {
      const url = new URL(String(value || ''), self.location.origin);
      if (url.origin === self.location.origin && url.pathname.startsWith('/site-assets/')) assets.add(url.href);
    } catch {}
  }
  return assets;
}

async function ensureManifestAssets(manifest, { force = false } = {}) {
  const required = manifestAssetSet(manifest);
  const cache = await caches.open(DATA_CACHE);
  const failed = [];
  let fetched = 0;
  let cached = 0;
  for (const href of required) {
    const request = new Request(href, { method: 'GET', credentials: 'same-origin' });
    if (!force && await cache.match(request)) {
      cached += 1;
      continue;
    }
    try {
      const response = await fetch(request, { cache: force ? 'reload' : 'force-cache' });
      if (response.status !== 200) {
        failed.push(href);
        continue;
      }
      await cache.put(request, response.clone());
      fetched += 1;
    } catch {
      failed.push(href);
    }
  }
  return { complete:failed.length === 0, total:required.size, fetched, cached, failed };
}

async function cleanupAssetCache(manifests) {
  const keep = new Set();
  for (const manifest of manifests || []) {
    for (const href of manifestAssetSet(manifest)) keep.add(href);
  }
  const cache = await caches.open(DATA_CACHE);
  const requests = await cache.keys();
  let removed = 0;
  await Promise.all(requests.map(async (request) => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/site-assets/') || keep.has(url.href)) return;
    if (await cache.delete(request)) removed += 1;
  }));
  return removed;
}


async function inspectAssetCache(manifests = {}) {
  const active = manifestAssetSet(manifests.active);
  const keep = new Set();
  for (const manifest of [manifests.active, manifests.previous, manifests.staging]) {
    for (const href of manifestAssetSet(manifest)) keep.add(href);
  }

  const cache = await caches.open(DATA_CACHE);
  const requests = await cache.keys();
  const cached = new Set(
    requests
      .map((request) => request.url)
      .filter((href) => {
        try { return new URL(href).pathname.startsWith('/site-assets/'); }
        catch { return false; }
      })
  );
  let activeCached = 0;
  for (const href of active) if (cached.has(href)) activeCached += 1;
  let retained = 0;
  let unused = 0;
  for (const href of cached) {
    if (keep.has(href)) retained += 1;
    else unused += 1;
  }

  return {
    active_assets:active.size,
    cached_assets:activeCached,
    missing_assets:Math.max(0, active.size - activeCached),
    retained_assets:retained,
    unused_assets:unused
  };
}

async function syncActiveAssets(values) {
  const manifest = { assets:values };
  const result = await ensureManifestAssets(manifest);
  if (!result.complete) return result;
  await cleanupAssetCache([manifest]);
  return result;
}

function reply(event, payload) {
  try { event.ports?.[0]?.postMessage(payload); } catch {}
}

self.addEventListener('message', (event) => {
  const type = event.data?.type;
  if (type === 'mira:player-cache-capabilities') {
    reply(event, { ok:true, local_first:true, protocol:2 });
    return;
  }
  if (type === 'mira:player-stage-assets') {
    event.waitUntil((async () => {
      const result = await ensureManifestAssets(event.data?.manifest);
      reply(event, { ok:result.complete, ...result });
    })());
    return;
  }
  if (type === 'mira:player-commit-assets') {
    event.waitUntil((async () => {
      const removed = await cleanupAssetCache([event.data?.active, event.data?.previous]);
      reply(event, { ok:true, removed });
    })());
    return;
  }

  if (type === 'mira:player-cache-inspect') {
    event.waitUntil((async () => {
      const status = await inspectAssetCache({
        active:event.data?.active,
        previous:event.data?.previous,
        staging:event.data?.staging
      });
      reply(event, { ok:true, ...status });
    })());
    return;
  }
  if (type === 'mira:player-cache-cleanup') {
    event.waitUntil((async () => {
      const manifests = {
        active:event.data?.active,
        previous:event.data?.previous,
        staging:event.data?.staging
      };
      const removed = await cleanupAssetCache([manifests.active, manifests.previous, manifests.staging]);
      const status = await inspectAssetCache(manifests);
      reply(event, { ok:true, removed, ...status });
    })());
    return;
  }
  if (type === 'mira:player-cache-redownload') {
    event.waitUntil((async () => {
      const result = await ensureManifestAssets(event.data?.active, { force:true });
      const status = await inspectAssetCache({
        active:event.data?.active,
        previous:event.data?.previous,
        staging:event.data?.staging
      });
      reply(event, { ok:result.complete, ...result, ...status });
    })());
    return;
  }
  if (type !== 'mira:player-active-assets' || !Array.isArray(event.data.assets)) return;
  event.waitUntil(syncActiveAssets(event.data.assets));
});

async function networkWithTimeout(request, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(request, { signal: controller.signal, cache: 'no-cache' }); }
  finally { clearTimeout(timer); }
}

async function cachedShell(request, fallbackPath = null) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request) || (fallbackPath ? await cache.match(fallbackPath) : null);
  if (cached) return cached;
  try {
    const response = await networkWithTimeout(request, 4000);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch { return Response.error(); }
}

async function cachedAsset(request) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await networkWithTimeout(request, 8000);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch { return Response.error(); }
}

async function videoRequest(request) {
  const cache = await caches.open(DATA_CACHE);
  const fullRequest = new Request(request.url, { method: 'GET', credentials: request.credentials });
  const cached = await cache.match(fullRequest);
  if (cached) return cached;
  if (!request.headers.has('range')) return cachedAsset(request);

  // A fully staged video is served directly from Cache Storage. Only uncached
  // videos use the browser's native byte-range network pipeline.
  try {
    const ranged = await networkWithTimeout(request, 8000);
    if (ranged.status === 206 || ranged.ok) return ranged;
  } catch {}
  return Response.error();
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate' && url.pathname === '/player.html') {
    event.respondWith(Response.redirect(new URL('/player', self.location.origin).href, 308));
    return;
  }
  if (event.request.mode === 'navigate' && url.pathname === '/player') {
    event.respondWith(cachedShell(event.request, '/player.html'));
    return;
  }
  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(cachedShell(event.request));
    return;
  }
  if (/^\/site-assets\/.*\.(?:mp4|webm)$/i.test(url.pathname)) {
    event.respondWith(videoRequest(event.request));
    return;
  }
  if (url.pathname.startsWith('/site-assets/')) event.respondWith(cachedAsset(event.request));
});