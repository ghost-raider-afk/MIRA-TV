const RETIRED_SHELL_CACHE = 'mira-tv-player-shell-v18';
const LEGACY_SHELL_CACHE = 'mira-tv-player-shell-v19';
const SHELL_CACHE = 'mira-tv-player-shell-v20';
const DATA_CACHE = 'mira-tv-player-data-v18';
// Source revision: scene entity animation modes and runtime refresh. A changed service-worker script reinstalls and refreshes SHELL_ASSETS in-place.
const SHELL_ASSETS = [
  '/player.html',
  '/css/fonts.css',
  '/fonts/DejaVuSans.ttf',
  '/fonts/DejaVuSans-Bold.ttf',
  '/fonts/DejaVuSansCondensed.ttf',
  '/fonts/DejaVuSansCondensed-Bold.ttf',
  '/fonts/DejaVuSerif.ttf',
  '/fonts/DejaVuSerif-Bold.ttf',
  '/css/player.css',
  '/css/weather-widget.css',
  '/css/motion-overlays.css',
  '/css/brand-motion-v2.css',
  '/css/scene-playlist.css',
  '/js/player/player.js',
  '/js/player/player-store.js',
  '/js/player/player-realtime-client.js',
  '/js/player/player-state-sync.js',
  '/js/player/entity-runtime.js',
  '/js/player/weather-bootstrap.js',
  '/js/player/flat-menu-renderer.js',
  '/js/player/scene-layer-composer.js',
  '/js/player/gpu-scene-runtime.js',
  '/js/editor/renderer.js',
  '/js/editor/renderer-model.js',
  '/js/editor/renderer-svg.js',
  '/js/motion/weather-widget.js',
  '/js/motion/entity-editor.js',
  '/js/motion/entity-behavior.js',
  '/js/motion/announcement.js',
  '/js/motion/brand-title.js',
  '/js/motion/environment.js',
  '/js/motion/scene-playlist-runtime.js',
  '/js/motion/dom-scene-adapter.js',
  '/js/motion/scene-graph.js',
  '/js/motion/scene-composer.js',
  '/js/motion/scene-runtime.js',
  '/js/motion/timeline.js',
  '/js/motion/drivers/waapi-driver.js'
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

function activeAssetSet(values) {
  const assets = new Set();
  for (const value of values || []) {
    try {
      const url = new URL(String(value || ''), self.location.origin);
      if (url.origin === self.location.origin && url.pathname.startsWith('/site-assets/')) assets.add(url.href);
    } catch {}
  }
  return assets;
}

async function ensureActiveAssets(values) {
  const active = activeAssetSet(values);
  const cache = await caches.open(DATA_CACHE);
  let complete = true;
  for (const href of active) {
    if (await cache.match(href)) continue;
    try {
      const response = await fetch(href, { cache: 'no-store' });
      if (!response.ok) { complete = false; continue; }
      await cache.put(href, response.clone());
    } catch {
      complete = false;
    }
  }
  return { complete, active };
}

async function syncActiveAssets(values) {
  const { complete, active } = await ensureActiveAssets(values);
  if (!complete) return;
  const cache = await caches.open(DATA_CACHE);
  const requests = await cache.keys();
  await Promise.all(requests.map((request) => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/site-assets/')) return Promise.resolve(false);
    if (active.has(request.url)) return Promise.resolve(false);
    return cache.delete(request);
  }));
}

self.addEventListener('message', (event) => {
  const message = event.data || {};
  if (message.type === 'MIRA_PLAYER_ACTIVE_ASSETS') {
    event.waitUntil(syncActiveAssets(message.assets));
  }
});

async function shellRequest(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function dataRequest(request) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function videoRequest(request) {
  const cache = await caches.open(DATA_CACHE);
  const fullRequest = new Request(request.url, { method: 'GET', credentials: request.credentials, mode: request.mode, cache: 'default' });
  const cached = await cache.match(fullRequest);
  if (cached) return cached;
  return fetch(request);
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.headers.has('range') && url.pathname.startsWith('/site-assets/')) {
    event.respondWith(videoRequest(event.request));
    return;
  }
  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(shellRequest(event.request));
    return;
  }
  if (url.pathname.startsWith('/site-assets/')) event.respondWith(dataRequest(event.request));
});
