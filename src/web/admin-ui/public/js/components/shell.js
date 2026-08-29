import { navigationState } from '../core/navigation.js';
import { createSidebar, refreshSidebarActive } from './sidebar.js';
import { createContextPanel, refreshContextActive, refreshContextPanel } from './context-panel.js';
import { createHeader, initialiseHeader, refreshHeaderRoute } from './header.js';
import { createNotificationsLayer } from './notifications.js';

const CONTEXT_COLLAPSED_KEY = 'tv-menu.context-collapsed';
const CONTEXT_MOBILE_BREAKPOINT = 1180;
const PHONE_BREAKPOINT = 960;

function responsiveCollapsed() {
  return window.innerWidth <= CONTEXT_MOBILE_BREAKPOINT;
}

function phoneLayout() {
  return window.innerWidth <= PHONE_BREAKPOINT;
}

function syncContextChrome(shell, context, collapsed) {
  const openOnPhone = phoneLayout() && !collapsed;
  shell.querySelector('.ui-context-backdrop')?.classList.toggle('is-visible', openOnPhone);
  document.body.classList.toggle('ui-context-open', openOnPhone);
  const trigger = shell.querySelector('[data-mobile-context-trigger]');
  if (trigger) trigger.setAttribute('aria-expanded', String(openOnPhone));
  context.setAttribute('aria-hidden', String(collapsed && phoneLayout()));
}

function setCollapsed(shell, context, collapsed, { persist = false } = {}) {
  context.classList.toggle('is-collapsed', collapsed);
  shell.classList.toggle('ui-context-collapsed', collapsed);
  syncContextChrome(shell, context, collapsed);
  if (!persist || responsiveCollapsed()) return;
  try { localStorage.setItem(CONTEXT_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch {}
}

function savedCollapsedState() {
  try { return localStorage.getItem(CONTEXT_COLLAPSED_KEY) === '1'; }
  catch { return false; }
}

function applyViewportState(shell, context) {
  setCollapsed(shell, context, responsiveCollapsed() ? true : savedCollapsedState());
}

function wireContext(shell, rail, context, header) {
  const backdrop = shell.querySelector('.ui-context-backdrop');
  const mobileTrigger = header.querySelector('[data-mobile-context-trigger]');
  applyViewportState(shell, context);

  context.querySelector('.ui-context-close')?.addEventListener('click', () => {
    setCollapsed(shell, context, true, { persist: !responsiveCollapsed() });
  });

  mobileTrigger?.addEventListener('click', () => {
    if (!phoneLayout()) return;
    setCollapsed(shell, context, !context.classList.contains('is-collapsed'));
  });

  backdrop?.addEventListener('click', () => setCollapsed(shell, context, true));

  context.addEventListener('click', (event) => {
    const routeLink = event.target instanceof Element ? event.target.closest('.app-route-link') : null;
    if (routeLink && context.contains(routeLink)) setCollapsed(shell, context, true);
  });

  rail.querySelectorAll('.ui-rail-button').forEach((link) => {
    link.addEventListener('pointerenter', () => {
      if (!responsiveCollapsed() && link.classList.contains('active')) setCollapsed(shell, context, false);
    }, { passive: true });
    link.addEventListener('click', () => {
      if (phoneLayout()) {
        setCollapsed(shell, context, true);
        return;
      }
      setCollapsed(shell, context, false, { persist: !responsiveCollapsed() });
    });
  });

  context.addEventListener('pointerleave', () => {
    if (!responsiveCollapsed()) setCollapsed(shell, context, true);
  }, { passive: true });

  shell.querySelector('.app-content')?.addEventListener('pointerdown', (event) => {
    if (!responsiveCollapsed() || context.classList.contains('is-collapsed')) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-mobile-context-trigger], .ui-context')) return;
    setCollapsed(shell, context, true);
  }, { passive: true });

  let viewportWasResponsive = responsiveCollapsed();
  let viewportWasPhone = phoneLayout();
  window.addEventListener('resize', () => {
    const viewportIsResponsive = responsiveCollapsed();
    const viewportIsPhone = phoneLayout();
    if (viewportIsResponsive === viewportWasResponsive && viewportIsPhone === viewportWasPhone) return;
    viewportWasResponsive = viewportIsResponsive;
    viewportWasPhone = viewportIsPhone;
    applyViewportState(shell, context);
  }, { passive: true });

  window.addEventListener('hashchange', () => refreshContextActive(context));
}

export function refreshShellRoute() {
  const { section, currentPage } = navigationState();
  document.body.dataset.appPage = currentPage;
  document.body.dataset.uiSection = section;
  refreshSidebarActive();
  refreshContextPanel();
  refreshHeaderRoute();
  initialiseHeader();
}

export function initialiseShell() {
  const shell = document.querySelector('.app-shell');
  const content = shell?.querySelector('.app-content');
  if (!shell || !content) return;
  if (shell.querySelector('.ui-rail')) {
    refreshShellRoute();
    return;
  }

  const { section, currentPage } = navigationState();
  document.body.dataset.appPage = currentPage;
  document.body.dataset.uiSection = section;

  const rail = createSidebar();
  const context = createContextPanel();
  const header = createHeader();
  const notifications = createNotificationsLayer();
  const backdrop = document.createElement('button');
  backdrop.className = 'ui-context-backdrop';
  backdrop.type = 'button';
  backdrop.tabIndex = -1;
  backdrop.setAttribute('aria-label', 'Закрыть меню раздела');
  content.prepend(header);
  shell.prepend(backdrop);
  shell.prepend(context);
  shell.prepend(rail);
  document.body.append(notifications);

  wireContext(shell, rail, context, header);
  refreshShellRoute();
}
