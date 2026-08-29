import { API } from './config.js';
import { api } from './api.js';
import { state } from './state.js';
import { element } from './dom.js';
import { formatDate } from './presentation.js';

const PHONE_BREAKPOINT = 960;
const SEVERITY_LABELS = Object.freeze({ success: 'Успешно', warning: 'Предупреждение', error: 'Ошибка', info: 'Информация' });
const CATEGORY_LABELS = Object.freeze({ interface: 'Интерфейс', catalog: 'Каталог', monitors: 'Мониторы', tv: 'ТВ', sftp: 'SFTP', auth: 'Авторизация', settings: 'Настройки', system: 'Система' });

function eventRow(event) {
  const row = document.createElement('article');
  row.className = `event-row is-${event.severity || 'info'}`;
  const message = document.createElement('p');
  message.className = 'event-message';
  message.textContent = event.message;
  const details = document.createElement('p');
  details.className = 'event-details';
  const category = CATEGORY_LABELS[event.category] || event.category || 'Система';
  const severity = SEVERITY_LABELS[event.severity] || event.severity || 'Информация';
  details.textContent = `${severity} · ${category} · ${event.actor_username} · ${formatDate(event.created_at)}`;
  row.append(message, details);
  return row;
}

function renderEvents(list, empty, events) {
  if (!list || !empty) return;
  list.replaceChildren(...events.map(eventRow));
  empty.classList.toggle('is-hidden', events.length !== 0);
}

function updateBadge(count) {
  const badge = document.querySelector('[data-notification-count]');
  if (!badge) return;
  const visible = state.user?.notifications_enabled === false ? 0 : count;
  badge.textContent = visible > 99 ? '99+' : String(visible);
  badge.classList.toggle('is-hidden', visible === 0);
}

function phoneLayout() {
  return window.innerWidth <= PHONE_BREAKPOINT;
}

function positionDesktopPanel(button, layer) {
  if (phoneLayout()) {
    layer.style.removeProperty('--notification-panel-top');
    layer.style.removeProperty('--notification-panel-right');
    return;
  }
  const rect = button.getBoundingClientRect();
  layer.style.setProperty('--notification-panel-top', `${Math.round(rect.bottom + 7)}px`);
  layer.style.setProperty('--notification-panel-right', `${Math.max(10, Math.round(window.innerWidth - rect.right))}px`);
}

function setPanelOpen(button, layer, panel, open, { restoreFocus = false } = {}) {
  layer.classList.toggle('is-hidden', !open);
  button.setAttribute('aria-expanded', String(open));
  panel.setAttribute('aria-modal', String(open && phoneLayout()));
  document.body.classList.toggle('notifications-open', open && phoneLayout());
  if (open) {
    positionDesktopPanel(button, layer);
    return;
  }
  document.body.classList.remove('notifications-open');
  if (restoreFocus) button.focus({ preventScroll: true });
}

export async function loadNotifications(limit = 20) {
  const result = await api.get(`${API.notifications}?limit=${limit}`);
  renderEvents(document.querySelector('[data-notification-list]'), document.querySelector('[data-notification-empty]'), result.items);
  updateBadge(result.unread_count);
  return result;
}

export function startNotificationPolling() {
  if (state.notificationTimer) window.clearInterval(state.notificationTimer);
  const seconds = Number(state.site?.dashboard_refresh_seconds) || 45;
  state.notificationTimer = window.setInterval(() => {
    if (state.user?.notifications_enabled !== false) void loadNotifications().catch(() => undefined);
  }, seconds * 1000);
}

export function initialiseNotifications() {
  const button = element('notifications-button');
  const layer = element('notifications-layer');
  const panel = element('notifications-panel');
  if (!(button instanceof HTMLButtonElement) || !layer || !panel) return;
  if (button.dataset.notificationsBound === '1') return;
  button.dataset.notificationsBound = '1';

  void loadNotifications().catch(() => undefined);
  startNotificationPolling();

  const refreshFromEvent = () => {
    if (state.user?.notifications_enabled !== false) void loadNotifications().catch(() => undefined);
  };
  window.addEventListener('menu-tv:event-recorded', refreshFromEvent);

  const close = (restoreFocus = false) => setPanelOpen(button, layer, panel, false, { restoreFocus });
  const open = () => {
    setPanelOpen(button, layer, panel, true);
    void loadNotifications().catch(() => undefined);
    if (phoneLayout()) requestAnimationFrame(() => panel.querySelector('button, a')?.focus({ preventScroll: true }));
  };

  button.addEventListener('click', () => {
    if (layer.classList.contains('is-hidden')) open();
    else close(true);
  });

  layer.querySelectorAll('[data-notifications-close]').forEach((control) => {
    control.addEventListener('click', () => close(true));
  });

  document.addEventListener('click', (event) => {
    if (layer.classList.contains('is-hidden') || phoneLayout()) return;
    if (panel.contains(event.target) || button.contains(event.target)) return;
    close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !layer.classList.contains('is-hidden')) close(true);
  });

  window.addEventListener('resize', () => {
    if (layer.classList.contains('is-hidden')) return;
    positionDesktopPanel(button, layer);
    panel.setAttribute('aria-modal', String(phoneLayout()));
    document.body.classList.toggle('notifications-open', phoneLayout());
  }, { passive: true });

  element('mark-notifications-read')?.addEventListener('click', async () => {
    try {
      await api.post(`${API.notifications}/read`);
      await loadNotifications();
    } catch {
      // Scheduled refresh retries later.
    }
  });
}
