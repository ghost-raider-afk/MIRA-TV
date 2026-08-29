import { navigationState, routeIsActive } from '../core/navigation.js';
import { state } from '../core/state.js';

function appName() {
  return state.site?.app_name || state.site?.application_name || state.session?.app_name || 'MIRA-TV';
}

function userName() {
  return state.user?.display_name || state.session?.display_name || state.session?.username || 'Пользователь';
}

function contextTitle(section) {
  return ({ overview: 'Обзор', monitors: 'Мониторы', catalog: 'Каталог', settings: 'Настройки' })[section] || 'MIRA-TV';
}

function contextLinksMarkup(contextLinks, currentPage) {
  return contextLinks.map(([label, href]) => {
    const active = routeIsActive(href, currentPage);
    return `<a class="app-route-link${active ? ' active' : ''}" href="${href}"${active ? ' aria-current="page"' : ''}><span>${label}</span><span aria-hidden="true">›</span></a>`;
  }).join('');
}

export function refreshContextActive(root = document) {
  const { currentPage } = navigationState();
  root.querySelectorAll('.ui-context .app-route-link').forEach((link) => {
    const active = routeIsActive(link.getAttribute('href') || '', currentPage);
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

export function refreshContextPanel(root = document) {
  const context = root.querySelector('.ui-context');
  if (!context) return;
  const { section, currentPage, contextLinks } = navigationState();
  const heading = context.querySelector('.ui-context-head h2');
  const body = context.querySelector('.ui-context-body');
  if (heading) heading.textContent = contextTitle(section);
  if (body) body.innerHTML = contextLinksMarkup(contextLinks, currentPage);
  refreshContextActive(context);
  updateContextAccount(state.user);
}

export function createContextPanel() {
  const { section, currentPage, contextLinks } = navigationState();
  const context = document.createElement('aside');
  context.className = 'ui-context';
  context.setAttribute('aria-label', 'Контекст раздела');
  context.innerHTML = `<div class="ui-context-head"><div><span class="ui-context-kicker">TV MENU</span><h2>${contextTitle(section)}</h2></div><button class="ui-context-close" type="button" aria-label="Свернуть панель">‹</button></div><div class="ui-context-body">${contextLinksMarkup(contextLinks, currentPage)}</div><div class="ui-account-card"><span class="company-name" data-shell-company></span><div><span class="ui-account-user-row"><strong data-shell-user></strong><button type="button" data-logout>Выйти</button></span><small class="ui-account-role">Панель управления</small></div></div>`;
  context.querySelector('[data-shell-company]').textContent = appName();
  context.querySelector('[data-shell-user]').textContent = userName();
  return context;
}

export function updateContextAccount(user = state.user) {
  const displayName = user?.display_name || user?.username || state.session?.display_name || state.session?.username || 'Пользователь';
  document.querySelectorAll('[data-shell-user]').forEach((node) => { node.textContent = displayName; });
  document.querySelectorAll('[data-shell-company]').forEach((node) => { node.textContent = appName(); });
}
