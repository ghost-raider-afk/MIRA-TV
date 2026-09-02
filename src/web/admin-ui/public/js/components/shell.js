import { navigationState } from '../core/navigation.js';
import { createSidebar, refreshSidebarActive } from './sidebar.js';
import { createHeader, initialiseHeader, refreshHeaderRoute } from './header.js';
import { createNotificationsLayer } from './notifications.js';

export function refreshShellRoute() {
  const { section, currentPage } = navigationState();
  document.body.dataset.appPage = currentPage;
  document.body.dataset.uiSection = section;
  refreshSidebarActive();
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
  const header = createHeader();
  const notifications = createNotificationsLayer();
  content.prepend(header);
  shell.prepend(rail);
  document.body.append(notifications);
  refreshShellRoute();
}
