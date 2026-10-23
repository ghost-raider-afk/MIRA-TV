const RETIRED_SHELL_CACHE = 'mira-tv-player-shell-v84';
const LEGACY_SHELL_CACHE = 'mira-tv-player-shell-v42';
const SHELL_CACHE = 'mira-tv-player-shell-v85';
const DATA_CACHE = 'mira-tv-player-data-v18';
const SHELL_UPDATE_CHECK_MIN_MS = 60 * 60 * 1000;
// Source revision: v1.18.24; Player renderer unchanged, version parity only.
const CORE_SHELL_ASSETS = [
  '/player.html',
  '/player.webmanifest',
  '/css/fonts.css',
  '/css/player.css',
  '/css/player-scene.css',
  '/css/weather-widget.css',
  '/js/player/player.js',
  '/js/player/player-fullscreen.js',
  '/js/player/player-background-services.js',
  '/js/core/dom-compat.js',
  '/js/player/player-boot.js',
  '/js/player/fetch-timeout.js',
  '/js/player/player-preview-capture.js',
  '/js/player/player-metrics.js',
  '/js/player/player-scene-renderer.js',
  '/js/player/menu-theme-runtime.js',
  '/js/player/menu-theme-renderer.js',
  '/js/themes/menu-theme-registry.js',
  '/js/player/scene-element-renderer.js',
  '/js/player/player-store.js',
  '/js/player/player-realtime-client.js',
  '/js/player/player-state-sync.js',
  '/js/player/weather-bootstrap.js',
  '/js/player/weather-widget.js',
  '/js/player/flat-menu-renderer.js',
  '/js/player/scene-layer-composer.js',
  '/js/editor/renderer.js',
  '/js/editor/renderer-model.js',
  '/js/editor/renderer-lines.js',
  '/js/editor/renderer-layout.js',
  '/js/editor/renderer-svg.js',
];
const OPTIONAL_SHELL_ASSETS = [
  '/brand/player-icon-192.png',
  '/brand/player-icon-512.png',
  '/brand/themes/premium-background.svg',
  '/brand/themes/chalk-background.svg',
  '/brand/themes/brand-premium-background.svg',
  '/brand/themes/premium-side.svg',
  '/brand/themes/chalk-side.svg',
  '/brand/themes/brand-premium-side.svg',
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
  '/fonts/theme/montserrat-cyrillic-700-normal.woff2',
  '/fonts/theme/montserrat-cyrillic-900-normal.woff2',
  '/fonts/theme/roboto-condensed-cyrillic-400-normal.woff2',
  '/fonts/theme/roboto-condensed-cyrillic-700-normal.woff2',
  '/fonts/theme/oswald-cyrillic-700-normal.woff2',
  '/fonts/theme/russo-one-cyrillic-400-normal.woff2',
  '/fonts/theme/neucha-cyrillic-400-normal.woff2',
  '/fonts/theme/pt-sans-narrow-cyrillic-400-normal.woff2',
  '/fonts/theme/pt-sans-narrow-cyrillic-700-normal.woff2',
  '/fonts/theme/yanone-kaffeesatz-cyrillic-400-normal.woff2',
  '/fonts/theme/yanone-kaffeesatz-cyrillic-700-normal.woff2',
  '/fonts/theme/underdog-cyrillic-400-normal.woff2',
];
const SHELL_ASSETS = [...CORE_SHELL_ASSETS, ...OPTIONAL_SHELL_ASSETS];

let shellUpdateCheckInFlight = null;
let shellUpdateCheckedAt = 0;

async function cacheShellAsset(cache, path, required) {
  try {
    const request = new Request(path, { method:'GET', credentials:'same-origin', cache:'reload' });
    const response = await fetch(request);
    const type = response.headers.get('content-type') || '';
    const executable = path.endsWith('.js') || path.endsWith('.css') || path.endsWith('.html');
    const expectedType = path.endsWith('.js') ? /javascript|ecmascript/
      : path.endsWith('.css') ? /text\/css/ : /text\/html/;
    if (!response.ok || (executable && !expectedType.test(type))) {
      throw new Error(`Player shell asset unavailable or invalid: ${path} HTTP ${response.status}`);
    }
    await cache.put(path, response.clone());
    return true;
  } catch (error) {
    if (required) throw error;
    return false;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(CORE_SHELL_ASSETS.map((path) => cacheShellAsset(cache, path, true)));
    await Promise.all(OPTIONAL_SHELL_ASSETS.map((path) => cacheShellAsset(cache, path, false)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const older = names.filter((name) => /^mira-tv-player-shell-v\d+$/.test(name) && name !== SHELL_CACHE)
      .sort((a, b) => Number(b.split('-v').pop()) - Number(a.split('-v').pop()));
    // Retain one previous complete shell for offline rollback, and never navigate a live screen.
    const keep = new Set([SHELL_CACHE, DATA_CACHE, older[0]]);
    await Promise.all(names.filter((name) => name.startsWith('mira-tv-player-shell-') && !keep.has(name))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

function maybeCheckForShellUpdate() {
  const now = Date.now();
  if (shellUpdateCheckInFlight) return shellUpdateCheckInFlight;
  if (shellUpdateCheckedAt && now - shellUpdateCheckedAt < SHELL_UPDATE_CHECK_MIN_MS) return Promise.resolve(false);
  shellUpdateCheckedAt = now;
  shellUpdateCheckInFlight = Promise.resolve()
    .then(() => self.registration?.update?.())
    .then(() => true)
    .catch(() => false)
    .finally(() => { shellUpdateCheckInFlight = null; });
  return shellUpdateCheckInFlight;
}

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

async function ensureManifestAssets(manifest) {
  const required = manifestAssetSet(manifest);
  const cache = await caches.open(DATA_CACHE);
  const failed = [];
  let fetched = 0;
  let cached = 0;
  for (const href of required) {
    const request = new Request(href, { method: 'GET', credentials: 'same-origin' });
    if (await cache.match(request)) {
      cached += 1;
      continue;
    }
    try {
      const response = await fetch(request, { cache: 'force-cache' });
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
    reply(event, { ok:true, local_first:true, protocol:1 });
    event.waitUntil(maybeCheckForShellUpdate());
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
  // An incomplete upgrade must not strand offline TVs without CSS/JS.
  const names = (await caches.keys()).filter((name) =>
    /^mira-tv-player-shell-v\d+$/.test(name) && name !== SHELL_CACHE
  ).sort((a, b) => Number(b.split('-v').pop()) - Number(a.split('-v').pop()));
  for (const name of names) {
    const previous = await caches.open(name);
    const response = await previous.match(request) || (fallbackPath ? await previous.match(fallbackPath) : null);
    if (response) return response;
  }
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
  if (url.pathname.startsWith('/site-assets/')) event.respondWith(cachedAsset(event.request));
});