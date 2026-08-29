export function createNotificationsControl() {
  const wrap = document.createElement('div');
  wrap.className = 'notification-wrap';
  wrap.innerHTML = `<button class="icon-button notification-button" id="notifications-button" type="button" aria-label="События" aria-haspopup="dialog" aria-controls="notifications-panel" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 10a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></svg><span class="notification-badge is-hidden" data-notification-count></span></button>`;
  return wrap;
}

export function createNotificationsLayer() {
  const layer = document.createElement('div');
  layer.className = 'notification-layer is-hidden';
  layer.id = 'notifications-layer';
  layer.innerHTML = `<button class="notification-backdrop" data-notifications-close type="button" tabindex="-1" aria-label="Закрыть события"></button><section class="notification-panel" id="notifications-panel" role="dialog" aria-modal="false" aria-label="Последние события"><div class="panel-heading"><strong id="notifications-title">События</strong><div class="notification-heading-actions"><button class="text-button" id="mark-notifications-read" type="button">Прочитать все</button><button class="notification-close" data-notifications-close type="button" aria-label="Закрыть события">×</button></div></div><div data-notification-list></div><p class="empty-state is-hidden" data-notification-empty>Новых событий нет.</p><a class="panel-footer" href="/events">Открыть журнал событий</a></section>`;
  return layer;
}
