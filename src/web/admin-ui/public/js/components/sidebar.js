import { PRIMARY_ROUTES, navigationState, routeIsActive } from '../core/navigation.js';
import { state } from '../core/state.js';

const GROUP_LABELS = Object.freeze({
  content: 'Контент',
  show: 'Показ',
  system: 'Система'
});

const ICONS = Object.freeze({
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 10.5 12 3l8.5 7.5"/><path d="M5.5 9.5V21h13V9.5M9 21v-6h6v6"/></svg>',
  scenes: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="15" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  monitor: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>',
  catalog: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16M4 12h16M4 17.5h10"/><circle cx="18" cy="17.5" r="2"/></svg>',
  playlist: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h10M5 12h10M5 18h10"/><path d="m18 9 3 3-3 3"/></svg>',
  location: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></svg>',
  connect: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M9 21h6m-3-4v4M8 10h8m-4-4v8"/></svg>',
  events: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v3m12-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"/><path d="M8 13h3m2 0h3M8 17h3"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.55V20.3h-3v-.09a1.7 1.7 0 0 0-1.04-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.55-1.04h-.09v-3h.09A1.7 1.7 0 0 0 7 9.92a1.7 1.7 0 0 0-.34-1.88L6.6 7.98l2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.04-1.55v-.09h3v.09a1.7 1.7 0 0 0 1.04 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1.04h.09v3h-.09A1.7 1.7 0 0 0 19.4 15Z"/></svg>'
});

function appName() {
  return state.site?.app_name || state.site?.application_name || state.session?.app_name || 'MIRA-TV';
}

function navLink(route) {
  const active = routeIsActive(route.href);
  return `<a class="ui-rail-button${active ? ' active' : ''}" data-route-page="${route.page}" href="${route.href}"${active ? ' aria-current="page"' : ''}><span class="ui-rail-icon">${ICONS[route.icon] || ''}</span><span class="ui-rail-label">${route.label}</span></a>`;
}

function renderRoutes() {
  const sections = [];
  let currentGroup = null;
  for (const route of PRIMARY_ROUTES) {
    if (route.group !== currentGroup) {
      currentGroup = route.group;
      if (GROUP_LABELS[currentGroup]) sections.push(`<div class="ui-rail-section-label">${GROUP_LABELS[currentGroup]}</div>`);
    }
    sections.push(navLink(route));
  }
  return sections.join('');
}

export function refreshSidebarActive(root = document) {
  root.querySelectorAll('.ui-rail-button[data-route-page]').forEach((link) => {
    const active = routeIsActive(link.getAttribute('href') || '/');
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

export function createSidebar() {
  navigationState();
  const rail = document.createElement('aside');
  rail.className = 'ui-rail';
  rail.setAttribute('aria-label', 'Основная навигация');
  rail.innerHTML = `
    <a class="ui-rail-brand" href="/" title="${appName()}">
      <span class="brand-mark" data-shell-brand>ТВ</span>
      <span class="ui-brand-copy"><strong>${appName()}</strong><small>Digital Signage</small></span>
    </a>
    <nav class="ui-rail-nav" aria-label="Разделы">${renderRoutes()}</nav>`;
  const logo = state.site?.logo_url;
  if (logo) {
    const image = document.createElement('img');
    image.src = logo;
    image.alt = '';
    rail.querySelector('[data-shell-brand]')?.replaceChildren(image);
  }
  return rail;
}
