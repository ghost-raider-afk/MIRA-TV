import { canonicalRoutePath, isAppRoutePath, PREFETCH_ROUTE_PATHS, routePageForPath } from './navigation.js';

let activeRouter = null;

function canonicalUrl(value) {
  const url = value instanceof URL ? new URL(value.href) : new URL(String(value), window.location.href);
  url.pathname = canonicalRoutePath(url.pathname);
  return url;
}

function routeIdentity(url) {
  return `${url.pathname}${url.search}${url.hash}`;
}

function isAppRoute(url) {
  return url.origin === window.location.origin && isAppRoutePath(url.pathname);
}

function shouldHandleAnchor(event, anchor) {
  if (!anchor || event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.hasAttribute('download')) return false;
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#')) return false;
  return isAppRoute(canonicalUrl(anchor.href));
}

function normaliseLifecycle(value) {
  if (!value) return null;
  if (typeof value === 'function') return { dispose: value };
  if (typeof value === 'object') return value;
  return null;
}

function currentMain() {
  const main = document.querySelector('.main-content');
  if (!main) throw new Error('Рабочая область приложения не найдена.');
  return main;
}

function setRouteMountState(main, mounting) {
  main.inert = mounting;
  if (mounting) {
    main.setAttribute('aria-busy', 'true');
    main.dataset.routeState = 'mounting';
  } else {
    main.removeAttribute('aria-busy');
    main.dataset.routeState = 'ready';
  }
}

function currentViewSnapshot() {
  const main = currentMain();
  const declaredPage = document.body.dataset.page || '';
  return {
    page: routePageForPath(window.location.pathname, declaredPage),
    declaredPage,
    mainClassName: main.className,
    mainHtml: main.innerHTML,
    documentTitle: document.title
  };
}

function parseViewDocument(html, responseUrl) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const responsePath = new URL(responseUrl, window.location.origin).pathname;
  const declaredPage = parsed.body?.dataset?.page || '';
  const page = routePageForPath(responsePath, declaredPage);
  if (page === 'signin') {
    window.location.replace('/signin');
    return null;
  }
  const main = parsed.querySelector('.main-content');
  if (!main || !page) throw new Error(`Маршрут ${responseUrl} не содержит рабочую область.`);
  return {
    page,
    declaredPage,
    mainClassName: main.className,
    mainHtml: main.innerHTML,
    documentTitle: parsed.title || document.title
  };
}

export function navigate(url, options = {}) {
  if (activeRouter) return activeRouter.navigate(url, options);
  const target = canonicalUrl(url);
  if (options.replace) window.location.replace(target.href);
  else window.location.assign(target.href);
  return Promise.resolve(false);
}

export function createAppRouter({ mountPage, syncShell }) {
  if (typeof mountPage !== 'function') throw new TypeError('mountPage is required');

  const viewCache = new Map();
  let lifecycle = null;
  let activeIdentity = routeIdentity(canonicalUrl(window.location.href));
  let started = false;
  let navigationQueue = Promise.resolve();

  viewCache.set(canonicalUrl(window.location.href).pathname, currentViewSnapshot());

  async function loadView(target) {
    const cacheKey = target.pathname;
    if (viewCache.has(cacheKey)) return viewCache.get(cacheKey);

    const response = await fetch(cacheKey, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-cache',
      headers: { 'X-TV-Menu-View': '1' }
    });

    if (response.redirected && new URL(response.url).pathname === '/signin') {
      window.location.replace('/signin');
      return null;
    }
    if (!response.ok) throw new Error(`Не удалось открыть раздел (${response.status}).`);

    const view = parseViewDocument(await response.text(), response.url || cacheKey);
    if (view) viewCache.set(cacheKey, view);
    return view;
  }

  async function canLeaveCurrentPage() {
    if (typeof lifecycle?.canLeave !== 'function') return true;
    return (await lifecycle.canLeave()) !== false;
  }

  async function disposeCurrentPage() {
    window.dispatchEvent(new CustomEvent('mira:route-dispose'));
    if (typeof lifecycle?.dispose === 'function') await lifecycle.dispose();
    lifecycle = null;
  }

  async function mountCurrentPage(page, main = currentMain()) {
    setRouteMountState(main, true);
    try {
      lifecycle = normaliseLifecycle(await mountPage(page));
    } finally {
      setRouteMountState(main, false);
    }
  }

  async function commit(target, view, { replace = false, fromHistory = false } = {}) {
    if (!view) return false;
    if (!await canLeaveCurrentPage()) {
      if (fromHistory) window.history.pushState({ tvMenu: true }, '', activeIdentity);
      return false;
    }

    await disposeCurrentPage();

    if (!fromHistory) {
      const href = routeIdentity(target);
      if (replace) window.history.replaceState({ tvMenu: true }, '', href);
      else window.history.pushState({ tvMenu: true }, '', href);
    }

    document.body.dataset.page = view.declaredPage || view.page;
    const main = currentMain();
    main.className = view.mainClassName;
    main.innerHTML = view.mainHtml;
    document.title = view.documentTitle;

    if (typeof syncShell === 'function') syncShell();
    await mountCurrentPage(view.page, main);
    document.body.dataset.page = view.page;
    if (typeof syncShell === 'function') syncShell();
    activeIdentity = routeIdentity(target);
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    return true;
  }

  async function performNavigation(value, options = {}) {
    const target = canonicalUrl(value);
    if (!isAppRoute(target)) {
      window.location.assign(target.href);
      return false;
    }

    const targetIdentity = routeIdentity(target);
    if (!options.force && !options.fromHistory && targetIdentity === activeIdentity) {
      if (typeof syncShell === 'function') syncShell();
      return true;
    }

    try {
      const view = await loadView(target);
      return await commit(target, view, options);
    } catch (error) {
      console.error('Client-side navigation failed', error);
      window.location.assign(target.href);
      return false;
    }
  }

  function navigateInternal(value, options = {}) {
    const targetHref = canonicalUrl(value).href;
    const requestOptions = { ...options };
    const run = () => performNavigation(targetHref, requestOptions);
    const result = navigationQueue.then(run, run);
    navigationQueue = result.catch(() => false);
    return result;
  }

  function onDocumentClick(event) {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!shouldHandleAnchor(event, anchor)) return;
    event.preventDefault();
    void navigateInternal(anchor.href);
  }

  function onPopState() {
    void navigateInternal(window.location.href, { fromHistory: true, force: true });
  }

  function prefetch() {
    const run = () => {
      PREFETCH_ROUTE_PATHS.forEach((path) => {
        if (path === canonicalRoutePath(window.location.pathname)) return;
        void loadView(canonicalUrl(path)).catch(() => undefined);
      });
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1500 });
    else window.setTimeout(run, 120);
  }

  const router = Object.freeze({
    async start() {
      if (started) return;
      started = true;
      activeRouter = router;
      const initialUrl = canonicalUrl(window.location.href);
      const initialPage = routePageForPath(initialUrl.pathname, document.body.dataset.page || '');
      window.history.replaceState({ tvMenu: true }, '', routeIdentity(initialUrl));
      await mountCurrentPage(initialPage);
      document.body.dataset.page = initialPage;
      if (typeof syncShell === 'function') syncShell();
      document.addEventListener('click', onDocumentClick);
      window.addEventListener('popstate', onPopState);
      prefetch();
    },
    navigate: navigateInternal,
    async stop() {
      document.removeEventListener('click', onDocumentClick);
      window.removeEventListener('popstate', onPopState);
      await navigationQueue.catch(() => undefined);
      await disposeCurrentPage();
      if (activeRouter === router) activeRouter = null;
      started = false;
    }
  });

  return router;
}
