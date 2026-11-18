import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { formatDate } from '../core/presentation.js';

const LABELS = Object.freeze({
  'connection.online':'WebSocket подключён',
  'connection.offline':'WebSocket отключён',
  'connection.http_fallback_ok':'HTTP работает без WebSocket',
  'websocket.connected':'Player подключился к WebSocket',
  'websocket.disconnected':'Player потерял WebSocket',
  'sync.failed':'Ошибка синхронизации',
  'state.restored':'Локальная сцена восстановлена',
  'state.rollback.previous':'Восстановлена предыдущая сцена',
  'asset.preload.degraded':'Ресурс сцены недоступен'
});

let dialog = null;
let activeScreen = null;
let requestVersion = 0;
let busy = false;
let cursor = null;
let events = [];

function node(tag, value = '', cls = '') {
  const item = document.createElement(tag);
  if (cls) item.className = cls;
  item.textContent = value;
  return item;
}

function source(event) {
  return event.event_type?.startsWith('connection.') && event.boot_id?.startsWith('server-')
    ? 'Сервер'
    : 'Player';
}

function interpretation(data) {
  const timeout = data.events?.find(e =>
    e.event_type === 'connection.offline' && e.metadata?.cause === 'heartbeat_timeout');
  if (timeout) return 'Сервер не получил ответ на heartbeat. Причина не подтверждена: возможны разрыв сети, зависание браузера или перегрузка ТВ.';
  const offline = data.events?.find(e => e.event_type === 'connection.offline');
  const fallback = data.events?.find(e => e.event_type === 'connection.http_fallback_ok');
  if (offline && fallback) return 'Зафиксирован обрыв WebSocket при доступном HTTP. Проверьте обратный прокси и сеть. События могут относиться к разным попыткам.';
  if (!data.online) return 'Активного WebSocket нет. Локальные логи ТВ поступят на сервер после восстановления HTTP-связи.';
  if (Number(data.outages) > 0) return 'Сейчас соединение восстановлено. За выбранный период сервер фиксировал отключения WebSocket, в том числе возможные штатные. Подробности в журнале.';
  return 'WebSocket подключён. Отключений, зарегистрированных этим сервером за период, нет. Перезапуск сервера может оставить пробелы.';
}

function renderEvents() {
  if (!dialog) return;
  const host = dialog.querySelector('[data-connection-events]');
  const level = dialog.querySelector('[data-connection-level]').value;
  host.replaceChildren();
  let count = 0;
  for (const event of events) {
    if (level !== 'all' && event.level !== level) continue;
    count += 1;
    const row = node('article', '', 'tv-connection-event is-' + (['warn','error'].includes(event.level) ? event.level : 'info'));
    const head = node('div', '', 'tv-connection-event-head');
    head.append(node('strong', LABELS[event.event_type] || event.event_type || 'Событие'),
      node('small', source(event)));
    row.append(head);
    const when = source(event) === 'Сервер'
      ? event.server_received_at : (event.device_timestamp || event.server_received_at);
    row.append(node('small', when ? formatDate(when) : 'Время не определено'));
    if (source(event) !== 'Сервер' && event.device_timestamp && event.server_received_at &&
        Math.abs(Date.parse(event.device_timestamp) - Date.parse(event.server_received_at)) > 300000) {
      row.append(node('small', ' · Получено сервером: ' + formatDate(event.server_received_at)));
    }
    const meta = event.metadata;
    if (meta && typeof meta === 'object' && Object.keys(meta).length) {
      const details = document.createElement('details');
      details.append(node('summary', 'Технические данные'), node('pre', JSON.stringify(meta, null, 2)));
      row.append(details);
    }
    host.append(row);
  }
  if (!count) host.append(node('p',
    events.length ? 'Нет событий выбранного уровня.' : 'Событий за выбранный период пока нет.',
    'tv-connection-empty'));
  const more = dialog.querySelector('[data-connection-more]');
  more.hidden = !cursor;
  more.disabled = busy;
  dialog.querySelector('[data-connection-count]').textContent = 'Загружено: ' + events.length;
}

function renderSummary(data) {
  dialog.querySelector('[data-connection-online]').textContent = data.online ? 'Онлайн' : 'Офлайн';
  dialog.querySelector('[data-connection-outages]').textContent = String(data.outages ?? 0);
  dialog.querySelector('[data-connection-ping]').textContent = data.ping_measured
    ? (Number.isFinite(data.ping_ms) ? Math.round(data.ping_ms) + ' мс' : 'Нет ответа')
    : 'Не измерен';
  dialog.querySelector('[data-connection-last-seen]').textContent =
    data.last_seen_at ? formatDate(data.last_seen_at) : 'Нет данных';
  dialog.querySelector('[data-connection-interpretation]').textContent = interpretation(data);
}

async function load({ append = false, ping = false } = {}) {
  if (!activeScreen || !dialog?.open || (append && busy)) return;
  const version = ++requestVersion;
  const screenId = Number(activeScreen.id);
  busy = true;
  dialog.querySelector('[data-connection-refresh]').disabled = true;
  dialog.querySelector('[data-connection-more]').disabled = true;
  dialog.querySelector('[data-connection-status]').textContent = 'Загружаем журнал…';
  try {
    const params = new URLSearchParams({ hours:dialog.querySelector('[data-connection-hours]').value });
    if (append && cursor) params.set('cursor', cursor);
    if (ping) params.set('measure_ping', '1');
    const data = await api.get(API.deviceBindings + '/' + screenId + '/diagnostics?' + params);
    if (version !== requestVersion || !dialog?.open || Number(activeScreen?.id) !== screenId) return;
    events = append ? events.concat(data.events || []) : (data.events || []);
    cursor = data.next_cursor || null;
    renderSummary(data);
    dialog.querySelector('[data-connection-status]').textContent =
      'Серверные события и полученные после восстановления логи Player.';
  } catch (error) {
    if (version === requestVersion && dialog?.open) {
      dialog.querySelector('[data-connection-status]').textContent =
        error.message || 'Не удалось получить историю соединений.';
    }
  } finally {
    if (version === requestVersion) {
      busy = false;
      dialog?.querySelector('[data-connection-refresh]')?.removeAttribute('disabled');
      renderEvents();
    }
  }
}

function exportCsv() {
  if (!activeScreen || !events.length) return;
  const rows = [
    ['Время ТВ', 'Время сервера', 'Источник', 'Уровень', 'Событие', 'Данные'],
    ...events.map(e => [e.device_timestamp || '', e.server_received_at || '', source(e),
      e.level || '', e.event_type || '', JSON.stringify(e.metadata || {})])
  ];
  const quote = value => {
    const s = String(value ?? '');
    const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const csv = '\ufeff' + rows.map(r => r.map(quote).join(';')).join('\r\n');
  const href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = 'mira-tv-connection-' + activeScreen.id + '.csv';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

function ensureDialog() {
  if (dialog?.isConnected) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'tv-connection-dialog';
  dialog.innerHTML = [
    '<header class="tv-connection-header"><div><p class="eyebrow">TV-СЕТЬ · ДИАГНОСТИКА</p><h2 data-connection-title>История связи</h2></div>',
    '<button type="button" class="screen-tv-management-close" data-connection-close aria-label="Закрыть">×</button></header>',
    '<div class="tv-connection-body">',
    '<div class="tv-connection-toolbar"><label>Период <select data-connection-hours><option value="24">24 часа</option><option value="168">7 дней</option><option value="720">30 дней</option></select></label>',
    '<button type="button" class="button button-secondary" data-connection-refresh>Проверить связь</button>',
    '<button type="button" class="button button-secondary" data-connection-export>Экспорт CSV</button></div>',
    '<div class="tv-connection-stats">',
    '<div><small>WebSocket</small><strong data-connection-online>—</strong></div>',
    '<div><small>Отключений</small><strong data-connection-outages>—</strong></div>',
    '<div><small>Ping</small><strong data-connection-ping>—</strong></div>',
    '<div><small>Последняя связь</small><strong data-connection-last-seen>—</strong></div></div>',
    '<p data-connection-interpretation class="tv-connection-interpretation">Получение данных…</p>',
    '<div class="tv-connection-events-head"><strong>Журнал событий</strong><label>Уровень <select data-connection-level><option value="all">Все</option><option value="warn">Предупреждения</option><option value="error">Ошибки</option><option value="info">Информация</option></select></label></div>',
    '<p data-connection-status class="tv-connection-status" role="status"></p>',
    '<div class="tv-connection-events" data-connection-events></div>',
    '<div class="tv-connection-footer"><span data-connection-count></span>',
    '<button type="button" class="button button-secondary" data-connection-more hidden>Загрузить ещё</button></div>',
    '</div>'
  ].join('');
  dialog.querySelector('[data-connection-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    activeScreen = null;
    cursor = null;
    events = [];
    busy = false;
    requestVersion += 1;
  });
  dialog.querySelector('[data-connection-refresh]').addEventListener('click', () => void load({ ping:true }));
  dialog.querySelector('[data-connection-more]').addEventListener('click', () => void load({ append:true }));
  dialog.querySelector('[data-connection-export]').addEventListener('click', exportCsv);
  dialog.querySelector('[data-connection-hours]').addEventListener('change', () => {
    cursor = null; events = []; void load({ ping:true });
  });
  dialog.querySelector('[data-connection-level]').addEventListener('change', renderEvents);
  document.body.append(dialog);
  return dialog;
}

export function openTvConnectionDiagnostics(screen) {
  if (!Number.isSafeInteger(Number(screen?.id)) || Number(screen.id) < 1) return;
  const view = ensureDialog();
  activeScreen = screen;
  cursor = null;
  events = [];
  view.querySelector('[data-connection-title]').textContent =
    'TV ' + (screen.location_number || screen.id) + ' · ' + (screen.location_name || screen.name || 'Диагностика');
  if (!view.open) view.showModal();
  void load({ ping:true });
}

export function disposeTvConnectionDiagnostics() {
  requestVersion += 1;
  if (dialog) {
    dialog.close();
    dialog.remove();
  }
  dialog = null;
  activeScreen = null;
  cursor = null;
  events = [];
  busy = false;
}
