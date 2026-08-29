import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { navigationState } from '../core/navigation.js';
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
}

export function createHeader() {
  const { title } = navigationState();
  document.title = `${appName()} — ${title}`;
  const header = document.createElement('header');
  header.className = 'app-header';
  header.innerHTML = `<button class="mobile-context-trigger" data-mobile-context-trigger type="button" aria-expanded="false" aria-label="Открыть меню раздела: ${title}"></button><div class="app-header-title"><strong data-app-name></strong><span></span></div><div class="app-header-actions"></div>`;
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
