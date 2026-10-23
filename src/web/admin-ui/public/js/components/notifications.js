export function createNotificationsControl() {
  const wrap=document.createElement('div');
  wrap.className='notification-wrap request-notification-controls';
  wrap.innerHTML='<button class="icon-button notification-button" id="notifications-button" type="button" aria-label="Уведомления о заявках" aria-haspopup="dialog" aria-controls="notifications-panel" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 10a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></svg><span class="notification-badge is-hidden" data-notification-count></span></button><button class="icon-button request-sound-button" id="request-sound-button" type="button" aria-label="Включить звук заявок" title="Звук выключен"></button>';
  return wrap;
}
export function createNotificationsLayer() {
  const layer=document.createElement('div');
  layer.className='notification-layer is-hidden';
  layer.id='notifications-layer';
  layer.innerHTML='<button class="notification-backdrop" data-notifications-close type="button" tabindex="-1" aria-label="Закрыть уведомления"></button><section class="notification-panel request-notification-panel" id="notifications-panel" role="dialog" aria-modal="false" aria-label="Уведомления о заявках"><div class="panel-heading"><strong>Уведомления о заявках</strong><div class="notification-heading-actions"><button class="text-button" id="mark-notifications-read" type="button">Прочитать все</button><button class="notification-close" data-notifications-close type="button" aria-label="Закрыть уведомления">×</button></div></div><div class="request-center-list" data-notification-list></div><p class="empty-state is-hidden" data-notification-empty>Уведомлений нет</p><button class="request-center-more" id="request-notifications-more" type="button" hidden>Показать ещё</button><div class="request-center-actions"><button class="text-button" id="request-notifications-pause" type="button">Приостановить показ</button><button class="text-button request-clear-button" id="request-notifications-clear" type="button">Очистить все</button></div></section>';
  return layer;
}
