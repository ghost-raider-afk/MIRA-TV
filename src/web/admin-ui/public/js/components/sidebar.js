import { PRIMARY_ROUTES, navigationState } from '../core/navigation.js';
import { state } from '../core/state.js';

const ICONS = Object.freeze({
  monitor: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>',
  scene: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="12" rx="2"/><path d="M8 20h8M12 17v3M7.5 9.5h9M7.5 12.5h6"/></svg>',
  catalog: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16M4 12h16M4 17.5h10"/><circle cx="18" cy="17.5" r="2"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.55V20.3h-3v-.09a1.7 1.7 0 0 0-1.04-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.55-1.04h-.09v-3h.09A1.7 1.7 0 0 0 7 9.92a1.7 1.7 0 0 0-.34-1.88L6.6 7.98l2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.04-1.55v-.09h3v.09a1.7 1.7 0 0 0 1.04 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1.04h.09v3h-.09A1.7 1.7 0 0 0 19.4 15Z"/></svg>'
});

function appName() {
  return state.site?.app_name || state.site?.application_name || state.session?.app_name || 'MIRA-TV';
}

function railLink(route, activeSection) {
  const active = route.key === activeSection;
  const label = route.mobileLabel || route.label;
  return `<a class="ui-rail-button${active ? ' active' : ''}" data-route-section="${route.key}" href="${route.href}" aria-label="${route.label}" title="${route.label}"${active ? ' aria-current="page"' : ''}><span class="ui-rail-icon">${ICONS[route.icon] || ''}</span><span class="ui-rail-label">${label}</span></a>`;
}

export function refreshSidebarActive(root = document) {
  const { section } = navigationState();
  root.querySelectorAll('.ui-rail-button[data-route-section]').forEach((link) => {
    const active = link.dataset.routeSection === section;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

export function createSidebar() {
  const { section } = navigationState();
  const rail = document.createElement('aside');
  rail.className = 'ui-rail';
  rail.setAttribute('aria-label', 'Основные разделы');
  rail.innerHTML = `<a class="ui-rail-brand" href="/" title="${appName()}"><span class="brand-mark" data-shell-brand>ТВ</span></a><nav class="ui-rail-nav" aria-label="Разделы">${PRIMARY_ROUTES.map((route) => railLink(route, section)).join('')}</nav>`;
  const logo = state.site?.logo_url;
  if (logo) {
    const image = document.createElement('img');
    image.src = logo;
    image.alt = '';
    rail.querySelector('[data-shell-brand]')?.replaceChildren(image);
  }
  return rail;
}
