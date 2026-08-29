import { pageName } from './config.js';

export const ROUTE_DEFINITIONS = Object.freeze([
  Object.freeze({ path: '/', page: 'overview', section: 'overview', title: 'Обзор', prefetch: false }),
  Object.freeze({ path: '/locations', page: 'locations', section: 'monitors', title: 'Торговые точки', prefetch: true }),
  Object.freeze({ path: '/screens', page: 'screens', section: 'monitors', title: 'Мониторы', prefetch: true }),
  Object.freeze({ path: '/connect-tv', page: 'connect-tv', section: 'monitors', title: 'Подключить ТВ', prefetch: true }),
  Object.freeze({ path: '/screen-editor', page: 'screen-editor', section: 'monitors', title: 'Редактор меню', prefetch: true }),
  Object.freeze({ path: '/catalog', page: 'catalog', section: 'catalog', title: 'Каталог', prefetch: true }),
  Object.freeze({ path: '/playlist', page: 'playlist', section: 'playlist', title: 'Плейлист', prefetch: true }),
  Object.freeze({ path: '/settings', page: 'settings', section: 'settings', title: 'Настройки сайта', prefetch: true }),
  Object.freeze({ path: '/sftp-settings', page: 'sftp-settings', section: 'settings', title: 'SFTP', prefetch: true }),
  Object.freeze({ path: '/events', page: 'events', section: 'settings', title: 'Журнал событий', prefetch: true }),
  Object.freeze({ path: '/profile', page: 'profile', section: 'settings', title: 'Профиль', prefetch: true })
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

const CONTEXT_LINKS = Object.freeze({
  overview: Object.freeze([['Обзор', '/']]),
  monitors: Object.freeze([['Торговые точки', '/locations'], ['Мониторы', '/screens'], ['Подключить ТВ', '/connect-tv']]),
  catalog: Object.freeze([['Продукция', '/catalog']]),
  playlist: Object.freeze([['Плейлист', '/playlist']]),
  settings: Object.freeze([['Настройки сайта', '/settings'], ['SFTP', '/sftp-settings'], ['Журнал событий', '/events'], ['Профиль', '/profile']])
});

export const PRIMARY_ROUTES = Object.freeze([
  Object.freeze({ key: 'monitors', label: 'Мониторы', href: '/screens', icon: 'monitor' }),
  Object.freeze({ key: 'catalog', label: 'Каталог', href: '/catalog', icon: 'catalog' }),
  Object.freeze({ key: 'playlist', label: 'Плейлист', href: '/playlist', icon: 'motion' }),
  Object.freeze({ key: 'settings', label: 'Настройки', href: '/settings', icon: 'settings' })
]);

export function navigationState(currentPage = pageName()) {
  const route = ROUTE_BY_PAGE.get(currentPage) || ROUTE_BY_PAGE.get('overview');
  return {
    currentPage,
    section: route.section,
    title: route.title,
    contextLinks: CONTEXT_LINKS[route.section] || CONTEXT_LINKS.overview
  };
}

export function routeIsActive(href, currentPage = pageName()) {
  if (href === '/') return currentPage === 'overview';
  const target = new URL(href, window.location.origin);
  if (currentPage === 'screen-editor' && canonicalRoutePath(target.pathname) === '/screens') return true;
  if (canonicalRoutePath(window.location.pathname) !== canonicalRoutePath(target.pathname)) return false;
  if (!target.hash) return true;
  return window.location.hash === target.hash;
}
