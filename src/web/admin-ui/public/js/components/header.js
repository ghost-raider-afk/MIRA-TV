import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { canonicalRoutePath, contextLinksForSection, DESKTOP_PRIMARY_ROUTES, navigationState } from '../core/navigation.js';
import { state } from '../core/state.js';
import { applyTheme, currentTheme } from '../core/presentation.js';
import { setIcon } from './icons.js';
import { createNotificationsControl } from './notifications.js';
import { updateContextAccount } from './context-panel.js';

function initials(value) {
  const parts = String(value || 'TV').trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((part) => part[0]).join('') || 'TV').toUpperCase();
}

function displayName(user = state.user) {
  return user?.display_name || user?.username || state.session?.display_name || state.session?.username || 'Пользователь';
}

function appName() {
  return state.site?.app_name || state.site?.application_name || state.session?.app_name || 'MIRA-TV';
}

function homeControl() {
  const link = document.createElement('a');
  link.className = 'app-header-home';
  link.href = '/';
  link.innerHTML = '<span class="app-header-home-mark" data-header-brand>ТВ</span><span class="app-header-home-name" data-header-home-name></span>';
  syncHeaderBrand(link);
  return link;
}

function primaryNavigation(activeSection) {
  const nav = document.createElement('nav');
  nav.className = 'app-header-nav';
  nav.setAttribute('aria-label', 'Основные разделы');
  nav.innerHTML = `<span class="app-header-nav-indicator" aria-hidden="true"></span>${DESKTOP_PRIMARY_ROUTES.map((route) => {
    const active = route.key === activeSection;
    const children = contextLinksForSection(route.key);
    const link = `<a class="app-header-nav-link${active ? ' active' : ''}" data-header-section="${route.key}" href="${route.href}"><span>${route.label}</span>${children.length ? '<svg class="app-header-nav-caret" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3"/></svg>' : ''}</a>`;
    if (!children.length) return link;
    const menu = children.map(([label, href]) => `<a class="app-header-dropdown-link" data-header-path="${href}" href="${href}" role="menuitem">${label}</a>`).join('');
    return `<div class="app-header-nav-item has-menu" data-header-nav-group="${route.key}">${link}<div class="app-header-dropdown" role="menu" aria-label="${route.label}">${menu}</div></div>`;
  }).join('')}`;
  return nav;
}

function navGroupLink(target) {
  if (!(target instanceof Element)) return null;
  const direct = target.closest('.app-header-nav-link');
  if (direct) return direct;
  return target.closest('.app-header-nav-item')?.querySelector('.app-header-nav-link') || null;
}

function positionNavigationIndicator(nav, link) {
  const indicator = nav?.querySelector('.app-header-nav-indicator');
  if (!nav || !indicator || !link) return;
  const navRect = nav.getBoundingClientRect();
  const linkRect = link.getBoundingClientRect();
  if (!navRect.width || !linkRect.width) return;
  const inset = Math.min(13, Math.max(7, linkRect.width * 0.16));
  nav.style.setProperty('--header-nav-indicator-x', `${linkRect.left - navRect.left + inset}px`);
  nav.style.setProperty('--header-nav-indicator-width', `${Math.max(20, linkRect.width - (inset * 2))}px`);
  nav.classList.add('has-indicator');
}

function syncNavigationIndicator(root = document) {
  const nav = root.querySelector?.('.app-header-nav') || (root.matches?.('.app-header-nav') ? root : null);
  if (!nav) return;
  positionNavigationIndicator(nav, nav.querySelector('.app-header-nav-link.active'));
}

function initialiseNavigationMotion(header) {
  const nav = header?.querySelector('.app-header-nav');
  if (!nav || nav.dataset.motionBound === '1') {
    syncNavigationIndicator(header || document);
    return;
  }
  nav.dataset.motionBound = '1';
  nav.addEventListener('pointerover', (event) => {
    const link = navGroupLink(event.target);
    if (link && nav.contains(link)) positionNavigationIndicator(nav, link);
  });
  nav.addEventListener('pointerleave', () => syncNavigationIndicator(nav));
  nav.addEventListener('focusin', (event) => {
    const link = navGroupLink(event.target);
    if (link && nav.contains(link)) positionNavigationIndicator(nav, link);
  });
  nav.addEventListener('focusout', (event) => {
    if (!nav.contains(event.relatedTarget)) syncNavigationIndicator(nav);
  });
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => syncNavigationIndicator(nav));
    observer.observe(nav);
  } else {
    window.addEventListener('resize', () => syncNavigationIndicator(nav), { passive: true });
  }
  requestAnimationFrame(() => syncNavigationIndicator(nav));
}

function syncHeaderNavigation(root = document) {
  const { section } = navigationState();
  const currentPath = canonicalRoutePath(window.location.pathname);
  root.querySelectorAll('.app-header-nav-link[data-header-section]').forEach((link) => {
    const active = link.dataset.headerSection === section;
    const exact = canonicalRoutePath(new URL(link.href, window.location.origin).pathname) === currentPath;
    link.classList.toggle('active', active);
    if (exact) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  root.querySelectorAll('.app-header-dropdown-link[data-header-path]').forEach((link) => {
    const active = canonicalRoutePath(link.dataset.headerPath) === currentPath;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  syncNavigationIndicator(root);
}

function syncHeaderBrand(root = document) {
  const name = appName();
  const logo = String(state.site?.logo_url || '').trim();
  const links = root instanceof Element && root.matches('.app-header-home')
    ? [root]
    : [...root.querySelectorAll('.app-header-home')];
  links.forEach((link) => {
    link.setAttribute('aria-label', `${name} — Дашборд`);
    link.setAttribute('title', `${name} — Дашборд`);
    const homeName = link.querySelector('[data-header-home-name]');
    if (homeName) homeName.textContent = name;
    const mark = link.querySelector('[data-header-brand]');
    if (!mark) return;
    if (logo) {
      const image = document.createElement('img');
      image.src = logo;
      image.alt = '';
      mark.replaceChildren(image);
    } else {
      mark.textContent = 'ТВ';
    }
  });
}

function accountControl() {
  const wrap = document.createElement('div');
  wrap.className = 'header-account';
  wrap.innerHTML = `<button class="header-account-trigger" type="button" aria-expanded="false" aria-haspopup="menu"><span class="profile-avatar" data-profile-initials>TV</span><span class="header-account-name" data-profile-name></span></button><div class="header-account-menu is-hidden" role="menu"><a href="/profile" role="menuitem">Профиль</a><button type="button" data-logout role="menuitem">Выйти</button></div>`;
  return wrap;
}

export function refreshHeaderRoute(root = document) {
  const { title } = navigationState();
  document.title = `${appName()} — ${title}`;
  const header = root.querySelector('.app-header');
  if (!header) return;
  const titleNode = header.querySelector('.app-header-title span');
  if (titleNode) titleNode.textContent = title;
  const nameNode = header.querySelector('[data-app-name]');
  if (nameNode) nameNode.textContent = appName();
  const sectionTrigger = header.querySelector('[data-mobile-context-trigger]');
  if (sectionTrigger) sectionTrigger.setAttribute('aria-label', `Открыть меню раздела: ${title}`);
  syncHeaderNavigation(header);
  syncHeaderBrand(root);
}

export function createHeader() {
  const { title, section } = navigationState();
  document.title = `${appName()} — ${title}`;
  const header = document.createElement('header');
  header.className = 'app-header';
  header.innerHTML = `<button class="mobile-context-trigger" data-mobile-context-trigger type="button" aria-expanded="false" aria-controls="app-context-panel" aria-label="Открыть меню раздела: ${title}"></button><div class="app-header-title"><strong data-app-name></strong><span></span></div><div class="app-header-actions"></div>`;
  header.prepend(homeControl(), primaryNavigation(section));
  setIcon(header.querySelector('[data-mobile-context-trigger]'), 'menu');
  header.querySelector('[data-app-name]').textContent = appName();
  header.querySelector('.app-header-title span').textContent = title;
  const actions = header.querySelector('.app-header-actions');
  actions.append(accountControl(), createNotificationsControl());
  const theme = document.createElement('button');
  theme.className = 'icon-button';
  theme.id = 'theme-toggle';
  theme.type = 'button';
  actions.append(theme);
  updateHeaderAccount(state.user, header);
  syncThemeButton(theme);
  return header;
}

export function updateHeaderAccount(user = state.user, root = document) {
  const name = displayName(user);
  root.querySelectorAll('[data-profile-name], [data-session-user], [data-shell-user]').forEach((node) => { node.textContent = name; });
  root.querySelectorAll('[data-profile-email]').forEach((node) => { node.textContent = user?.email || 'Настройки учётной записи'; });
  root.querySelectorAll('[data-profile-initials]').forEach((node) => { node.textContent = initials(name); });
  root.querySelectorAll('[data-app-name]').forEach((node) => { node.textContent = appName(); });
  updateContextAccount(user);
}

function syncThemeButton(button = document.getElementById('theme-toggle')) {
  if (!button) return;
  const dark = currentTheme() === 'dark';
  setIcon(button, dark ? 'sun' : 'moon');
  button.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
}

async function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  const preferences = state.user || await api.get(API.userSettings);
  const updated = await api.put(API.userSettings, { ...preferences, theme: next });
  state.user = updated;
  applyTheme(updated.theme);
  syncThemeButton();
}

async function logout() {
  try { await api.post(API.logout); }
  finally { window.location.replace('/signin'); }
}

export function initialiseHeader() {
  updateHeaderAccount(state.user);
  refreshHeaderRoute();
  const header = document.querySelector('.app-header');
  initialiseNavigationMotion(header);
  const account = document.querySelector('.header-account');
  const trigger = account?.querySelector('.header-account-trigger');
  const menu = account?.querySelector('.header-account-menu');
  if (trigger && menu && trigger.dataset.bound !== '1') {
    trigger.dataset.bound = '1';
    trigger.addEventListener('click', () => {
      const open = menu.classList.contains('is-hidden');
      menu.classList.toggle('is-hidden', !open);
      trigger.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (event) => {
      if (!account.contains(event.target)) {
        menu.classList.add('is-hidden');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
  }
  document.querySelectorAll('[data-logout]').forEach((button) => {
    if (button.dataset.logoutBound === '1') return;
    button.dataset.logoutBound = '1';
    button.addEventListener('click', () => { void logout(); });
  });
  const theme = document.getElementById('theme-toggle');
  if (theme && theme.dataset.bound !== '1') {
    theme.dataset.bound = '1';
    theme.addEventListener('click', () => { void toggleTheme(); });
  }
  syncThemeButton();
}
