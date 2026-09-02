import { pageName } from './config.js';

export const ROUTE_DEFINITIONS = Object.freeze([
  Object.freeze({ path: '/', page: 'overview', section: 'overview', title: 'Обзор', prefetch: false }),
  Object.freeze({ path: '/scenes', page: 'scenes', section: 'content', title: 'Сцены', prefetch: true }),
  Object.freeze({ path: '/scene-editor', page: 'scene-editor', section: 'content', title: 'Конструктор сцены', prefetch: true }),
  Object.freeze({ path: '/catalog', page: 'catalog', section: 'content', title: 'Каталог', prefetch: true }),
  Object.freeze({ path: '/playlist', page: 'playlist', section: 'content', title: 'Плейлисты', prefetch: false }),
  Object.freeze({ path: '/screens', page: 'screens', section: 'show', title: 'Мониторы', prefetch: true }),
  Object.freeze({ path: '/locations', page: 'locations', section: 'show', title: 'Торговые точки', prefetch: true }),
  Object.freeze({ path: '/connect-tv', page: 'connect-tv', section: 'show', title: 'Подключить ТВ', prefetch: true }),
  Object.freeze({ path: '/screen-editor', page: 'screen-editor', section: 'show', title: 'Мониторы', prefetch: false }),
  Object.freeze({ path: '/settings', page: 'settings', section: 'system', title: 'Настройки', prefetch: true }),
  Object.freeze({ path: '/events', page: 'events', section: 'system', title: 'Журнал событий', prefetch: true }),
  Object.freeze({ path: '/profile', page: 'profile', section: 'system', title: 'Профиль', prefetch: true })
]);

const ROUTE_BY_PAGE = new Map(ROUTE_DEFINITIONS.map((route) => [route.page, route]));
const ROUTE_BY_PATH = new Map(ROUTE_DEFINITIONS.map((route) => [route.path, route]));
const ROUTE_PATHS = new Set(ROUTE_DEFINITIONS.map((route) => route.path));

export function canonicalRoutePath(pathname) {
  const source = String(pathname || '/');
  if (source === '/index.html' || source === '/index') return '/';
  if (source === '/animation.html' || source === '/animation') return '/playlist';
  if (source.endsWith('.html')) return source.slice(0, -5) || '/';
  return source;
}

export function routePageForPath(pathname, fallback = '') {
  return ROUTE_BY_PATH.get(canonicalRoutePath(pathname))?.page || fallback;
}

export function isAppRoutePath(pathname) {
  return ROUTE_PATHS.has(canonicalRoutePath(pathname));
}

export const PREFETCH_ROUTE_PATHS = Object.freeze(ROUTE_DEFINITIONS.filter((route) => route.prefetch).map((route) => route.path));

export const PRIMARY_ROUTES = Object.freeze([
  Object.freeze({ key: 'overview', page: 'overview', label: 'Обзор', href: '/', icon: 'home', group: 'main' }),
  Object.freeze({ key: 'scenes', page: 'scenes', label: 'Сцены', href: '/scenes', icon: 'scenes', group: 'content' }),
  Object.freeze({ key: 'catalog', page: 'catalog', label: 'Каталог', href: '/catalog', icon: 'catalog', group: 'content' }),
  Object.freeze({ key: 'screens', page: 'screens', label: 'Мониторы', href: '/screens', icon: 'monitor', group: 'show' }),
  Object.freeze({ key: 'locations', page: 'locations', label: 'Торговые точки', href: '/locations', icon: 'location', group: 'show' }),
  Object.freeze({ key: 'connect-tv', page: 'connect-tv', label: 'Подключить ТВ', href: '/connect-tv', icon: 'connect', group: 'show' }),
  Object.freeze({ key: 'events', page: 'events', label: 'Журнал', href: '/events', icon: 'events', group: 'system' }),
  Object.freeze({ key: 'settings', page: 'settings', label: 'Настройки', href: '/settings', icon: 'settings', group: 'system' })
]);

export function navigationState(currentPage = pageName()) {
  const route = ROUTE_BY_PAGE.get(currentPage) || ROUTE_BY_PAGE.get('overview');
  return {
    currentPage,
    section: route.section,
    title: route.title,
    contextLinks: []
  };
}

export function routeIsActive(href, currentPage = pageName()) {
  if (href === '/') return currentPage === 'overview';
  const target = new URL(href, window.location.origin);
  if (currentPage === 'screen-editor' && canonicalRoutePath(target.pathname) === '/screens') return true;
  if (currentPage === 'scene-editor' && canonicalRoutePath(target.pathname) === '/scenes') return true;
  if (canonicalRoutePath(window.location.pathname) !== canonicalRoutePath(target.pathname)) return false;
  if (!target.hash) return true;
  return window.location.hash === target.hash;
}
