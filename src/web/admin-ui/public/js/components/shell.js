import { navigationState } from '../core/navigation.js';
import { createSidebar, refreshSidebarActive } from './sidebar.js';
import { createContextPanel, refreshContextActive, refreshContextPanel } from './context-panel.js';
import { createHeader, initialiseHeader, refreshHeaderRoute } from './header.js';
import { createNotificationsLayer } from './notifications.js';

const CONTEXT_MOBILE_BREAKPOINT = 1180;
const PHONE_BREAKPOINT = 960;

function responsiveCollapsed() {
  return window.innerWidth <= CONTEXT_MOBILE_BREAKPOINT;
}

function phoneLayout() {
  return window.innerWidth <= PHONE_BREAKPOINT;
}

function contextAvailable(context) {
  return context?.dataset?.contextAvailable === 'true';
}

function syncContextChrome(shell, context, collapsed) {
  const available = contextAvailable(context);
  const open = available && !collapsed;
  const openOnPhone = phoneLayout() && open;
  const backdrop = shell.querySelector('.ui-context-backdrop');
  const trigger = shell.querySelector('[data-mobile-context-trigger]');

  if (backdrop) {
    backdrop.hidden = !available;
    backdrop.classList.toggle('is-visible', openOnPhone);
  }

  document.body.classList.toggle('ui-context-open', openOnPhone);

  if (trigger) {
    trigger.hidden = !available;
    trigger.setAttribute('aria-expanded', String(openOnPhone));
  }

  context.hidden = !available;
  context.setAttribute('aria-hidden', String(!open));
  context.toggleAttribute('inert', !open);
}

function setCollapsed(shell, context, collapsed) {
  const next = collapsed || !contextAvailable(context);
  context.classList.toggle('is-collapsed', next);
  shell.classList.toggle('ui-context-collapsed', next);
  syncContextChrome(shell, context, next);
}

function requestContextOpen(shell, context) {
  if (!contextAvailable(context)) {
    context.dataset.openWhenAvailable = 'true';
    return;
  }
  context.dataset.openWhenAvailable = '';
  setCollapsed(shell, context, false);
}

function reconcileContextRoute(shell, context) {
  const { hasContext } = navigationState();
  const pendingOpen = context.dataset.openWhenAvailable === 'true';
  context.dataset.contextAvailable = hasContext ? 'true' : 'false';

  if (!hasContext) {
    context.dataset.openWhenAvailable = '';
    setCollapsed(shell, context, true);
    return;
  }

  context.hidden = false;
  if (pendingOpen) {
    context.dataset.openWhenAvailable = '';
    setCollapsed(shell, context, false);
    return;
  }

  syncContextChrome(shell, context, context.classList.contains('is-collapsed'));
}

function focusContext(context) {
  const target = context.querySelector('.app-route-link.active, .app-route-link, .ui-context-close');
  target?.focus?.({ preventScroll: true });
}

function focusMobileTrigger(trigger) {
  if (phoneLayout() && trigger && !trigger.hidden) trigger.focus({ preventScroll: true });
}

function wireContext(shell, rail, context, header) {
  const backdrop = shell.querySelector('.ui-context-backdrop');
  const mobileTrigger = header.querySelector('[data-mobile-context-trigger]');

  context.dataset.contextAvailable = navigationState().hasContext ? 'true' : 'false';
  context.dataset.openWhenAvailable = '';
  setCollapsed(shell, context, true);

  context.querySelector('.ui-context-close')?.addEventListener('click', () => {
    setCollapsed(shell, context, true);
    focusMobileTrigger(mobileTrigger);
  });

  mobileTrigger?.addEventListener('click', () => {
    if (!phoneLayout() || !contextAvailable(context)) return;
    const opening = context.classList.contains('is-collapsed');
    setCollapsed(shell, context, !opening);
    if (opening) requestAnimationFrame(() => focusContext(context));
  });

  backdrop?.addEventListener('click', () => {
    setCollapsed(shell, context, true);
    focusMobileTrigger(mobileTrigger);
  });

  context.addEventListener('click', (event) => {
    const routeLink = event.target instanceof Element ? event.target.closest('.app-route-link') : null;
    if (!routeLink || !context.contains(routeLink)) return;
    context.dataset.openWhenAvailable = '';
    setCollapsed(shell, context, true);
  });

  rail.querySelectorAll('.ui-rail-button').forEach((link) => {
    link.addEventListener('pointerenter', () => {
      if (!responsiveCollapsed() && link.classList.contains('active')) requestContextOpen(shell, context);
    }, { passive: true });

    link.addEventListener('click', () => {
      if (phoneLayout()) {
        context.dataset.openWhenAvailable = '';
        setCollapsed(shell, context, true);
        return;
      }
      requestContextOpen(shell, context);
    });
  });

  context.addEventListener('pointerleave', () => {
    if (!responsiveCollapsed()) setCollapsed(shell, context, true);
  }, { passive: true });

  shell.querySelector('.app-content')?.addEventListener('pointerdown', (event) => {
    if (context.classList.contains('is-collapsed') || !contextAvailable(context)) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-mobile-context-trigger], .ui-context')) return;
    setCollapsed(shell, context, true);
  }, { passive: true });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || context.classList.contains('is-collapsed') || !contextAvailable(context)) return;
    setCollapsed(shell, context, true);
    focusMobileTrigger(mobileTrigger);
  });

  let viewportWasResponsive = responsiveCollapsed();
  let viewportWasPhone = phoneLayout();
  window.addEventListener('resize', () => {
    const viewportIsResponsive = responsiveCollapsed();
    const viewportIsPhone = phoneLayout();
    if (viewportIsResponsive === viewportWasResponsive && viewportIsPhone === viewportWasPhone) return;
    viewportWasResponsive = viewportIsResponsive;
    viewportWasPhone = viewportIsPhone;
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
  content.prepend(header);
  shell.prepend(backdrop);
  shell.prepend(context);
  shell.prepend(rail);
  document.body.append(notifications);

  wireContext(shell, rail, context, header);
  refreshShellRoute();
  shell.classList.add('ui-shell-ready');
  requestAnimationFrame(() => shell.classList.remove('ui-shell-bootstrapping'));
}
