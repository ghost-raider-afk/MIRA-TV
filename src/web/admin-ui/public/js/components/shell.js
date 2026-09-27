import { navigationState } from '../core/navigation.js';
import { createSidebar, refreshSidebarActive } from './sidebar.js';
import { createContextPanel, refreshContextActive, refreshContextPanel } from './context-panel.js';
import { createHeader, initialiseHeader, refreshHeaderRoute } from './header.js';
import { createNotificationsLayer } from './notifications.js';

const PHONE_BREAKPOINT = 960;

function phoneLayout() {
  return window.innerWidth <= PHONE_BREAKPOINT;
}

function contextAvailable(context) {
  return context?.dataset?.contextAvailable === 'true';
}

function syncContextChrome(shell, context, collapsed = context.classList.contains('is-collapsed')) {
  const available = contextAvailable(context);
  const mobile = phoneLayout();
  const open = available && (!mobile || !collapsed);
  const backdrop = shell.querySelector('.ui-context-backdrop');
  const trigger = shell.querySelector('[data-mobile-context-trigger]');

  if (backdrop) {
    backdrop.hidden = !available || !mobile;
    backdrop.classList.toggle('is-visible', mobile && open);
  }

  document.body.classList.toggle('ui-context-open', mobile && open);

  if (trigger) {
    trigger.hidden = !available || !mobile;
    trigger.setAttribute('aria-expanded', String(mobile && open));
  }

  context.hidden = !available;
  context.classList.toggle('is-collapsed', mobile && collapsed);
  context.setAttribute('aria-hidden', String(!open));
  context.toggleAttribute('inert', !open);
}

function setCollapsed(shell, context, collapsed) {
  syncContextChrome(shell, context, phoneLayout() ? collapsed : false);
}

function reconcileContextRoute(shell, context) {
  const { hasContext } = navigationState();
  context.dataset.contextAvailable = hasContext ? 'true' : 'false';
  setCollapsed(shell, context, true);
}

function focusContext(context) {
  const target = context.querySelector('.app-route-link.active, .app-route-link, .ui-context-close');
  target?.focus?.({ preventScroll: true });
}

function wireContext(shell, rail, context, header) {
  const backdrop = shell.querySelector('.ui-context-backdrop');
  const mobileTrigger = header.querySelector('[data-mobile-context-trigger]');

  context.dataset.contextAvailable = navigationState().hasContext ? 'true' : 'false';
  setCollapsed(shell, context, true);

  context.querySelector('.ui-context-close')?.addEventListener('click', () => {
    if (!phoneLayout()) return;
    setCollapsed(shell, context, true);
    mobileTrigger?.focus({ preventScroll: true });
  });

  mobileTrigger?.addEventListener('click', () => {
    if (!phoneLayout() || !contextAvailable(context)) return;
    const opening = context.classList.contains('is-collapsed');
    setCollapsed(shell, context, !opening);
    if (opening) focusContext(context);
  });

  backdrop?.addEventListener('click', () => {
    if (!phoneLayout()) return;
    setCollapsed(shell, context, true);
    mobileTrigger?.focus({ preventScroll: true });
  });

  context.addEventListener('click', (event) => {
    if (!phoneLayout()) return;
    const routeLink = event.target instanceof Element ? event.target.closest('.app-route-link') : null;
    if (routeLink && context.contains(routeLink)) setCollapsed(shell, context, true);
  });

  rail.addEventListener('click', (event) => {
    if (!phoneLayout()) return;
    const routeLink = event.target instanceof Element ? event.target.closest('.ui-rail-button') : null;
    if (routeLink) setCollapsed(shell, context, true);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !phoneLayout() || context.classList.contains('is-collapsed')) return;
    setCollapsed(shell, context, true);
    mobileTrigger?.focus({ preventScroll: true });
  });

  let wasPhone = phoneLayout();
  window.addEventListener('resize', () => {
    const isPhone = phoneLayout();
    if (isPhone === wasPhone) return;
    wasPhone = isPhone;
    setCollapsed(shell, context, true);
  }, { passive: true });

  window.addEventListener('hashchange', () => refreshContextActive(context));
}

export function refreshShellRoute() {
  const { section, currentPage } = navigationState();
  document.body.dataset.appPage = currentPage;
  document.body.dataset.uiSection = section;
  refreshSidebarActive();
  refreshContextPanel();

  const shell = document.querySelector('.app-shell');
  const context = shell?.querySelector('.ui-context');
  if (shell && context) reconcileContextRoute(shell, context);

  refreshHeaderRoute();
  initialiseHeader();
}

export function initialiseShell() {
  const shell = document.querySelector('.app-shell');
  const content = shell?.querySelector('.app-content');
  if (!shell || !content) return;
  if (shell.querySelector('.ui-rail')) {
    refreshShellRoute();
    shell.classList.add('ui-shell-ready');
    return;
  }

  shell.classList.add('ui-shell-bootstrapping');

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

  content.prepend(context);
  content.prepend(header);
  shell.prepend(backdrop);
  shell.prepend(rail);
  document.body.append(notifications);

  wireContext(shell, rail, context, header);
  refreshShellRoute();
  shell.classList.add('ui-shell-ready');
  shell.classList.remove('ui-shell-bootstrapping');
}
