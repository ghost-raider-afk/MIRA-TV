const SHELL_CACHE = 'mira-tv-player-shell-v15';
const DATA_CACHE = 'mira-tv-player-data-v15';
const PLAYER_CONTEXT = '/api/device/player-context';
const SHELL_ASSETS = [
  '/player.html',
  '/css/player.css',
  '/css/motion-overlays.css',
  '/css/brand-motion-v2.css',
  '/css/scene-playlist.css',
  '/js/player/player.js',
  '/js/player/entity-runtime.js',
  '/js/player/flat-menu-renderer.js',
  '/js/player/scene-layer-composer.js',
  '/js/player/gpu-scene-runtime.js',
  '/js/editor/renderer.js',
  '/js/editor/renderer-model.js',
  '/js/editor/renderer-svg.js',
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
    const keep = new Set([SHELL_CACHE, DATA_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter((name) => (name.startsWith('tv-menu-player-') || name.startsWith('mira-tv-player-')) && !keep.has(name)).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkWithTimeout(request, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(request, { signal: controller.signal, cache: 'no-cache' }); }
  finally { clearTimeout(timer); }
}

async function playerPage(request) {
  try {
    const response = await networkWithTimeout(request, 4000);
    if (response.ok) await (await caches.open(SHELL_CACHE)).put('/player.html', response.clone());
    return response;
  } catch {
    return (await caches.match('/player.html')) || Response.error();
  }
}

async function playerContext(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await networkWithTimeout(request, 4000);
    if (response.status === 401 || response.status === 403) { await cache.delete(PLAYER_CONTEXT); return response; }
    if (response.status === 304) return (await cache.match(PLAYER_CONTEXT)) || response;
    if (response.ok) { await cache.put(PLAYER_CONTEXT, response.clone()); return response; }
    return (await cache.match(PLAYER_CONTEXT)) || response;
  } catch {
    const cached = await cache.match(PLAYER_CONTEXT);
    if (!cached) return Response.error();
    const headers = new Headers(cached.headers);
    headers.set('x-tv-menu-offline', '1');
    return new Response(await cached.clone().arrayBuffer(), { status: cached.status, statusText: cached.statusText, headers });
  }
}

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await networkWithTimeout(request, 4000);
    if (response.ok) await cache.put(request, response.clone());
    return response.ok ? response : ((await cache.match(request)) || response);
  } catch {
    return (await cache.match(request)) || Response.error();
  }
}

async function assetRequest(request) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request);
  try {
    const response = await networkWithTimeout(request, 5000);
    if (response.ok) await cache.put(request, response.clone());
    return response.ok ? response : (cached || response);
  } catch {
    return cached || Response.error();
  }
}

function rangeBounds(header, size) {
  const match = String(header || '').match(/^bytes=(\d*)-(\d*)$/i);
  if (!match) return null;
  let start = match[1] === '' ? null : Number(match[1]);
  let end = match[2] === '' ? null : Number(match[2]);
  if (start === null) {
    const suffix = Math.min(size, Math.max(0, end || 0));
    start = size - suffix;
    end = size - 1;
  } else {
    end = end === null ? size - 1 : Math.min(end, size - 1);
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= size) return null;
  return { start, end };
}

async function cachedVideoRange(request) {
  const cache = await caches.open(DATA_CACHE);
  const fullRequest = new Request(request.url, { method: 'GET', credentials: request.credentials });
  const cached = await cache.match(fullRequest);
  if (!cached || cached.status !== 200) return null;
  const body = await cached.clone().arrayBuffer();
  const bounds = rangeBounds(request.headers.get('range'), body.byteLength);
  if (!bounds) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${body.byteLength}` } });
  const headers = new Headers(cached.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Range', `bytes ${bounds.start}-${bounds.end}/${body.byteLength}`);
  headers.set('Content-Length', String(bounds.end - bounds.start + 1));
  return new Response(body.slice(bounds.start, bounds.end + 1), { status: 206, statusText: 'Partial Content', headers });
}

async function videoRequest(request) {
  if (!request.headers.has('range')) return assetRequest(request);
  const cachedRange = await cachedVideoRange(request);
  if (cachedRange) return cachedRange;
  try { return await networkWithTimeout(request, 5000); }
  catch { return Response.error(); }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate' && url.pathname === '/player.html') {
    event.respondWith(Response.redirect(new URL('/player', self.location.origin).href, 308));
    return;
  }
  if (event.request.mode === 'navigate' && url.pathname === '/player') { event.respondWith(playerPage(event.request)); return; }
  if (url.pathname === PLAYER_CONTEXT) { event.respondWith(playerContext(event.request)); return; }
  if (SHELL_ASSETS.includes(url.pathname)) { event.respondWith(networkFirstShell(event.request)); return; }
  if (/^\/site-assets\/entities\/.*\.(?:mp4|webm)$/i.test(url.pathname)) { event.respondWith(videoRequest(event.request)); return; }
  if (url.pathname.startsWith('/site-assets/')) event.respondWith(assetRequest(event.request));
});
