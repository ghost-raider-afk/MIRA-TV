import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { navigate } from '../core/router.js';
import { state } from '../core/state.js';
import { element, makeButton, setMessage } from '../core/dom.js';
import { formatDate } from '../core/presentation.js';

const STATUS_REFRESH_MS = 5000;
const pingByScreen = new Map();
let statusTimer = null;
let previewDialog = null;
let previewDialogScreenId = null;
let cacheDialog = null;
let cacheDialogScreenId = null;
let pendingCacheCommand = null;

function bindingForScreen(screenId) {
  return state.deviceBindings.find((binding) => Number(binding.screen_id) === Number(screenId)) || null;
}

function tvLabel(screen) {
  return `TV ${Number(screen.location_number) || screen.id}`;
}

function latestSeen(binding) {
  return binding?.realtime_last_seen_at || binding?.session_last_seen_at || binding?.device_last_seen_at || null;
}

function statusState(binding) {
  if (!binding) return { key:'unbound', title:'TV не подключён' };
  if (binding.online === true) return { key:'online', title:'Онлайн · связь есть' };
  return { key:'offline', title:'Офлайн' };
}

function rememberPing(binding) {
  if (!binding?.ping_measured_at) return;
  const rawPing = binding.ping_ms;
  const measuredPing = rawPing === null || rawPing === undefined || rawPing === '' ? null : Number(rawPing);
  pingByScreen.set(Number(binding.screen_id), {
    ms:Number.isFinite(measuredPing) ? measuredPing : null,
    connectedAt:binding.realtime_connected_at || null,
    measuredAt:binding.ping_measured_at
  });
}

async function requestBindings({ measurePing = false } = {}) {
  const suffix = measurePing ? '?measure_ping=1' : '';
  const bindings = await api.get(`${API.deviceBindings}${suffix}`);
  const list = Array.isArray(bindings) ? bindings : [];
  if (measurePing) list.forEach(rememberPing);
  return list;
}

function pingText(screenId, binding) {
  if (!binding?.online) return '—';
  const ping = pingByScreen.get(Number(screenId));
  if (!ping || ping.connectedAt !== (binding.realtime_connected_at || null)) return 'не измерен';
  return Number.isFinite(ping.ms) ? `${Math.round(ping.ms)} мс` : 'нет ответа';
}


function finiteValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatBytes(value) {
  const bytes = finiteValue(value);
  if (bytes === null || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} Б`;
  const units = ['КБ', 'МБ', 'ГБ', 'ТБ'];
  let amount = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && amount >= 1024; index += 1) {
    amount /= 1024;
    unit = units[index];
  }
  const rounded = amount >= 100 ? Math.round(amount) : Number(amount.toFixed(amount >= 10 ? 1 : 2));
  return `${rounded} ${unit}`;
}

function cacheSummary(binding) {
  const cache = binding?.cache_status;
  if (!binding) return '—';
  if (!cache) return 'нет данных';
  if (cache.local_first !== true) return 'Local-first недоступен';
  const total = finiteValue(cache.active_assets);
  const cached = finiteValue(cache.cached_assets);
  const missing = finiteValue(cache.missing_assets);
  if (total !== null && cached !== null && missing !== null) {
    if (missing === 0 && cached === total) return total ? `готово · ${cached}/${total}` : 'готово';
    return `неполный · ${cached}/${total}`;
  }
  return cache.active_revision ? 'активен' : 'ожидает синхронизации';
}

function cacheDetailRows(binding) {
  const cache = binding?.cache_status;
  if (!cache) return [
    ['Состояние', binding?.online ? 'Ожидаем первый отчёт Player' : 'Нет данных'],
    ['Последний отчёт', '—']
  ];
  const cachedAssets = finiteValue(cache.cached_assets);
  const activeAssets = finiteValue(cache.active_assets) ?? 0;
  const activeCount = cachedAssets !== null ? `${cachedAssets}/${activeAssets}` : String(activeAssets);
  const storageUsage = finiteValue(cache.storage_usage_bytes);
  const storageQuota = finiteValue(cache.storage_quota_bytes);
  const storage = storageUsage !== null
    ? `${formatBytes(storageUsage)}${storageQuota !== null ? ` / ${formatBytes(storageQuota)}` : ''}`
    : '—';
  return [
    ['Состояние', cacheSummary(binding)],
    ['Local-first', cache.local_first ? 'активен' : 'недоступен'],
    ['Активная ревизия', cache.active_revision || '—'],
    ['Резервная ревизия', cache.previous_revision || '—'],
    ['Staging', cache.staging_revision || 'нет'],
    ['Файлы активной', activeCount],
    ['Не хватает файлов', cache.missing_assets === null || cache.missing_assets === undefined ? '—' : String(cache.missing_assets)],
    ['Неиспользуемые', cache.unused_assets === null || cache.unused_assets === undefined ? '—' : String(cache.unused_assets)],
    ['Контент активной', formatBytes(cache.active_bytes)],
    ['Хранилище браузера', storage],
    ['Защищённое хранилище', cache.storage_persisted === true ? 'да' : cache.storage_persisted === false ? 'нет' : 'неизвестно'],
    ['Последний отчёт', cache.reported_at ? formatDate(cache.reported_at) : '—']
  ];
}

function previewUrl(screen, binding) {
  if (!binding?.online || !binding?.preview_available) return '';
  return `${API.deviceBindings}/${screen.id}/preview?v=${encodeURIComponent(binding.preview_updated_at || '')}`;
}

function createTvFace(screen, binding, large = false) {
  const status = statusState(binding);
  const face = document.createElement('div');
  face.className = `screen-tv-face is-${status.key}${large ? ' is-large' : ''}`;
  const url = previewUrl(screen, binding);
  if (url) {
    const image = document.createElement('img');
    image.src = url;
    image.alt = `Кадр ${tvLabel(screen)} с TV Player`;
    image.decoding = 'async';
    image.loading = 'eager';
    image.addEventListener('load', () => face.classList.add('has-player-frame'));
    image.addEventListener('error', () => image.remove());
    face.append(image);
  }
  const noise = document.createElement('span');
  noise.className = 'screen-tv-noise';
  noise.setAttribute('aria-hidden', 'true');
  face.append(noise);
  return face;
}

function diagnosticText(binding) {
  if (!binding || binding.online === true) return '';
  const diagnostic = binding.player_diagnostic;
  if (!diagnostic || !['warn', 'error'].includes(diagnostic.level)) return '';
  const phase = String(diagnostic.metadata?.phase || '');
  if (diagnostic.event_type === 'asset.preload.degraded') return 'ресурс сцены недоступен';
  if (diagnostic.event_type === 'session.handoff.pending') return 'браузер не подтвердил сессию TV';
  if (diagnostic.event_type === 'sync.failed') {
    if (phase === 'critical-assets') return 'не загружен ресурс сцены';
    if (phase === 'render') return 'ошибка рендеринга сцены';
    if (phase === 'prepare-assets') return 'ошибка подготовки ресурсов';
    return 'ошибка загрузки Player Context';
  }
  if (diagnostic.event_type === 'websocket.disconnected') return 'realtime-соединение потеряно';
  return '';
}

function metaRows(screen, binding) {
  const status = statusState(binding);
  const diagnostic = diagnosticText(binding);
  return [
    ['Статус', status.title, status.key],
    ['Последняя связь', latestSeen(binding) ? formatDate(latestSeen(binding)) : '—', ''],
    ['Производитель', binding?.manufacturer || 'Не определено', ''],
    ['Модель', binding?.model || 'Не определена', ''],
    ['IP-адрес', binding?.remote_address || '—', ''],
    ['Ping', pingText(screen.id, binding), ''],
    ['Кэш', cacheSummary(binding), ''],
    ...(diagnostic ? [['Диагностика', diagnostic, '']] : [])
  ];
}

function fillMeta(container, screen, binding) {
  container.replaceChildren();
  for (const [label, value, stateKey] of metaRows(screen, binding)) {
    const row = document.createElement('span');
    row.className = 'screen-tv-meta-row';
    const name = document.createElement('small');
    name.textContent = label;
    const text = document.createElement('strong');
    text.textContent = value;
    if (label === 'Статус') text.className = `is-${stateKey}`;
    row.append(name, text);
    container.append(row);
  }
}

function syncTvUnit(unit, screen, binding) {
  const status = statusState(binding);
  unit.dataset.tvState = status.key;
  const host = unit.querySelector('[data-tv-face-host]');
  if (host) {
    const faceKey = `${status.key}:${binding?.preview_updated_at || ''}`;
    if (host.dataset.tvFaceKey !== faceKey) {
      host.dataset.tvFaceKey = faceKey;
      host.replaceChildren(createTvFace(screen, binding));
    }
  }
  const meta = unit.querySelector('[data-tv-meta]');
  if (meta) fillMeta(meta, screen, binding);
  const bindAction = unit.querySelector('[data-tv-bind-action]');
  const unbindAction = unit.querySelector('[data-tv-unbind-action]');
  const cacheAction = unit.querySelector('[data-tv-cache-action]');
  if (bindAction) bindAction.hidden = Boolean(binding);
  if (unbindAction) unbindAction.hidden = !binding;
  if (cacheAction) cacheAction.hidden = !binding;
}

function createTvUnit(screen) {
  const binding = bindingForScreen(screen.id);
  const unit = document.createElement('article');
  unit.className = 'screen-tv-unit';
  unit.dataset.tvUnit = '';
  unit.dataset.screenId = String(screen.id);

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'screen-tv-card';
  open.setAttribute('aria-label', `Увеличить ${tvLabel(screen)}`);
  open.addEventListener('click', () => openPreview(screen));

  const bezel = document.createElement('div');
  bezel.className = 'screen-tv-bezel';
  const faceHost = document.createElement('div');
  faceHost.dataset.tvFaceHost = '';
  bezel.append(faceHost);
  const stand = document.createElement('span');
  stand.className = 'screen-tv-stand';
  stand.setAttribute('aria-hidden', 'true');
  const label = document.createElement('strong');
  label.className = 'screen-tv-label';
  label.textContent = tvLabel(screen);
  const meta = document.createElement('div');
  meta.className = 'screen-tv-meta';
  meta.dataset.tvMeta = '';
  open.append(bezel, stand, label, meta);

  const actions = document.createElement('div');
  actions.className = 'screen-tv-actions';
  const settings = document.createElement('a');
  settings.className = 'button button-secondary';
  settings.href = `/screen-editor?id=${screen.id}`;
  settings.textContent = 'Настройки';
  const scene = document.createElement('a');
  scene.className = 'button button-secondary';
  scene.href = `/scene?screen=${screen.id}`;
  scene.textContent = 'Сцена';
  const bind = document.createElement('a');
  bind.className = 'button button-secondary';
  bind.href = `/connect-tv?screen=${encodeURIComponent(screen.id)}`;
  bind.textContent = 'Подключить';
  bind.setAttribute('aria-label', `Подключить ${tvLabel(screen)}`);
  bind.dataset.tvBindAction = '';
  const cache = makeButton('Кэш', 'secondary', () => openCacheDialog(screen));
  cache.dataset.tvCacheAction = '';
  cache.setAttribute('aria-label', `Управление кэшем ${tvLabel(screen)}`);
  const unbind = makeButton('Отвязать', 'secondary', () => void unbindScreen(screen));
  unbind.dataset.tvUnbindAction = '';
  unbind.classList.add('screen-tv-unbind');
  const remove = makeButton('Удалить', 'danger', () => void deleteScreen(screen));
  actions.append(settings, scene, bind, cache, unbind, remove);

  unit.append(open, actions);
  syncTvUnit(unit, screen, binding);
  return unit;
}

function createSourceSelect() {
  const select = document.createElement('select');
  select.className = 'screen-copy-source';
  select.setAttribute('aria-label', 'Образец нового монитора');
  select.append(new Option('Пустой монитор', ''));
  state.screens.forEach((screen) => {
    select.append(new Option(`По образцу: ${screen.location_name} · ${screen.name}`, String(screen.id)));
  });
  return select;
}

function ensurePreviewDialog() {
  if (previewDialog?.isConnected) return previewDialog;
  const dialog = document.createElement('dialog');
  dialog.className = 'screen-tv-preview-dialog';
  dialog.innerHTML = `
    <div class="screen-tv-preview-shell">
      <button class="screen-tv-preview-close" type="button" aria-label="Закрыть">×</button>
      <div class="screen-tv-preview-visual" data-tv-preview-visual></div>
      <div class="screen-tv-preview-info">
        <p class="eyebrow">TV PLAYER</p>
        <h2 data-tv-preview-title>TV</h2>
        <div class="screen-tv-meta is-dialog" data-tv-preview-meta></div>
      </div>
    </div>`;
  dialog.querySelector('.screen-tv-preview-close')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { previewDialogScreenId = null; });
  document.body.append(dialog);
  previewDialog = dialog;
  return dialog;
}

function updatePreviewDialog(screen) {
  const dialog = ensurePreviewDialog();
  const binding = bindingForScreen(screen.id);
  dialog.querySelector('[data-tv-preview-title]').textContent = tvLabel(screen);
  dialog.querySelector('[data-tv-preview-visual]').replaceChildren(createTvFace(screen, binding, true));
  fillMeta(dialog.querySelector('[data-tv-preview-meta]'), screen, binding);
}

function openPreview(screen) {
  previewDialogScreenId = Number(screen.id);
  const dialog = ensurePreviewDialog();
  updatePreviewDialog(screen);
  if (!dialog.open) dialog.showModal();
}

function refreshOpenPreview() {
  if (!previewDialogScreenId || !previewDialog?.open) return;
  const screen = state.screens.find((item) => Number(item.id) === Number(previewDialogScreenId));
  if (screen) updatePreviewDialog(screen);
}


function ensureCacheDialog() {
  if (cacheDialog?.isConnected) return cacheDialog;
  const dialog = document.createElement('dialog');
  dialog.className = 'screen-tv-cache-dialog';
  dialog.innerHTML = `
    <div class="screen-tv-cache-shell">
      <button class="screen-tv-preview-close" type="button" aria-label="Закрыть">×</button>
      <header class="screen-tv-cache-header">
        <p class="eyebrow">LOCAL-FIRST PLAYER</p>
        <h2 data-tv-cache-title>Кэш TV</h2>
        <p data-tv-cache-summary>Нет данных</p>
      </header>
      <div class="screen-tv-cache-grid" data-tv-cache-meta></div>
      <p class="screen-tv-cache-message" data-tv-cache-message aria-live="polite"></p>
      <div class="screen-tv-cache-actions">
        <button class="button button-secondary" type="button" data-cache-command="check">Проверить</button>
        <button class="button button-secondary" type="button" data-cache-command="cleanup-unused">Очистить лишнее</button>
        <button class="button" type="button" data-cache-command="redownload-active">Перескачать активное</button>
      </div>
    </div>`;
  dialog.querySelector('.screen-tv-preview-close')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    cacheDialogScreenId = null;
    pendingCacheCommand = null;
  });
  dialog.querySelectorAll('[data-cache-command]').forEach((button) => {
    button.addEventListener('click', () => {
      const screen = state.screens.find((item) => Number(item.id) === Number(cacheDialogScreenId));
      if (screen) void sendCacheCommand(screen, button.dataset.cacheCommand);
    });
  });
  document.body.append(dialog);
  cacheDialog = dialog;
  return dialog;
}

function fillCacheMeta(container, binding) {
  container.replaceChildren();
  for (const [label, value] of cacheDetailRows(binding)) {
    const row = document.createElement('span');
    row.className = 'screen-tv-cache-row';
    const name = document.createElement('small');
    name.textContent = label;
    const text = document.createElement('strong');
    text.textContent = value;
    row.append(name, text);
    container.append(row);
  }
}

function updateCacheDialog(screen) {
  const dialog = ensureCacheDialog();
  const binding = bindingForScreen(screen.id);
  const cache = binding?.cache_status;
  dialog.querySelector('[data-tv-cache-title]').textContent = `Кэш ${tvLabel(screen)}`;
  dialog.querySelector('[data-tv-cache-summary]').textContent = cacheSummary(binding);
  fillCacheMeta(dialog.querySelector('[data-tv-cache-meta]'), binding);
  dialog.querySelectorAll('[data-cache-command]').forEach((button) => {
    button.disabled = binding?.online !== true || Boolean(pendingCacheCommand);
  });
  const message = dialog.querySelector('[data-tv-cache-message]');
  if (pendingCacheCommand?.screenId === Number(screen.id)) {
    if (cache?.last_command_id === pendingCacheCommand.requestId) {
      message.textContent = cache.last_command_message || (cache.last_command_ok ? 'Команда выполнена.' : 'Команда не выполнена.');
      message.className = `screen-tv-cache-message ${cache.last_command_ok ? 'is-success' : 'is-error'}`;
      pendingCacheCommand = null;
      dialog.querySelectorAll('[data-cache-command]').forEach((button) => { button.disabled = binding?.online !== true; });
    } else {
      message.textContent = 'Команда выполняется на TV Player…';
      message.className = 'screen-tv-cache-message';
    }
  } else if (cache?.last_command_message) {
    message.textContent = cache.last_command_message;
    message.className = `screen-tv-cache-message ${cache.last_command_ok === false ? 'is-error' : 'is-success'}`;
  } else {
    message.textContent = binding?.online ? 'Кэш можно проверить без остановки показа сцены.' : 'TV Player должен быть онлайн для управления кэшем.';
    message.className = 'screen-tv-cache-message';
  }
}

function openCacheDialog(screen) {
  cacheDialogScreenId = Number(screen.id);
  pendingCacheCommand = null;
  const dialog = ensureCacheDialog();
  updateCacheDialog(screen);
  if (!dialog.open) dialog.showModal();
}

function refreshOpenCacheDialog() {
  if (!cacheDialogScreenId || !cacheDialog?.open) return;
  const screen = state.screens.find((item) => Number(item.id) === Number(cacheDialogScreenId));
  if (screen) updateCacheDialog(screen);
}

async function sendCacheCommand(screen, action) {
  if (!['check', 'cleanup-unused', 'redownload-active'].includes(action)) return;
  if (action === 'redownload-active' && !window.confirm(`Перескачать весь активный контент для «${tvLabel(screen)}»? Большое видео будет загружено заново.`)) return;
  const dialog = ensureCacheDialog();
  const message = dialog.querySelector('[data-tv-cache-message]');
  try {
    dialog.querySelectorAll('[data-cache-command]').forEach((button) => { button.disabled = true; });
    message.textContent = 'Отправляем команду на TV Player…';
    message.className = 'screen-tv-cache-message';
    const result = await api.post(`${API.deviceBindings}/${screen.id}/cache-command`, { action });
    pendingCacheCommand = {
      screenId:Number(screen.id),
      requestId:String(result?.request_id || ''),
      action
    };
    message.textContent = 'Команда выполняется на TV Player…';
    window.setTimeout(() => void refreshRuntimeStatus().catch(() => undefined), 600);
  } catch (error) {
    pendingCacheCommand = null;
    message.textContent = error.message;
    message.className = 'screen-tv-cache-message is-error';
    dialog.querySelectorAll('[data-cache-command]').forEach((button) => { button.disabled = false; });
  }
}

function renderScreens() {
  const list = document.querySelector('[data-screen-hierarchy]');
  const empty = document.querySelector('[data-screens-empty]');
  if (!list || !empty) return;
  const groups = state.locations.map((location) => {
    const group = document.createElement('article');
    group.className = 'screen-location-group';

    const header = document.createElement('header');
    header.className = 'screen-location-header';
    const title = document.createElement('div');
    title.className = 'screen-location-title';
    const heading = document.createElement('h2');
    heading.textContent = location.name;
    heading.title = location.name;
    const details = document.createElement('p');
    details.textContent = location.address || 'Адрес не указан';
    title.append(heading, details);

    const create = document.createElement('div');
    create.className = 'screen-create-control';
    const source = createSourceSelect();
    const add = makeButton('+ TV', '', () => void createScreenAtLocation(location, source.value));
    add.classList.add('screen-location-add');
    create.append(source, add);
    header.append(title, create);

    const screens = state.screens.filter((screen) => Number(screen.location_id) === Number(location.id));
    const items = document.createElement('div');
    items.className = 'screen-location-items';
    screens.forEach((screen) => items.append(createTvUnit(screen)));
    if (!screens.length) {
      const hint = document.createElement('p');
      hint.className = 'empty-state compact-empty';
      hint.textContent = 'Телевизоров пока нет.';
      items.append(hint);
    }
    group.append(header, items);
    return group;
  });
  list.replaceChildren(...groups);
  empty.classList.toggle('is-hidden', state.locations.length !== 0);
}

async function loadScreens({ measurePing = true } = {}) {
  const [locations, screens, bindings] = await Promise.all([
    api.get(API.locations),
    api.get(API.screens),
    requestBindings({ measurePing })
  ]);
  state.locations = locations;
  state.screens = screens;
  state.deviceBindings = bindings;
  renderScreens();
  refreshOpenPreview();
  refreshOpenCacheDialog();
}

async function refreshRuntimeStatus() {
  const bindings = await requestBindings({ measurePing:false });
  state.deviceBindings = bindings;
  document.querySelectorAll('[data-tv-unit][data-screen-id]').forEach((unit) => {
    const screen = state.screens.find((item) => Number(item.id) === Number(unit.dataset.screenId));
    if (screen) syncTvUnit(unit, screen, bindingForScreen(screen.id));
  });
  refreshOpenPreview();
  refreshOpenCacheDialog();
}

async function unbindScreen(screen) {
  if (!window.confirm(`Отвязать телевизор от «${tvLabel(screen)}»? На ТВ снова появится экран подключения.`)) return;
  try {
    await api.delete(`${API.deviceBindings}/${screen.id}`);
    pingByScreen.delete(Number(screen.id));
    setMessage('screens-message', `${tvLabel(screen)} отвязан.`, 'success');
    await loadScreens({ measurePing:false });
  } catch (error) {
    setMessage('screens-message', error.message);
  }
}

async function deleteScreen(screen) {
  const binding = bindingForScreen(screen.id);
  const warning = binding ? ' Подключённый ТВ также потеряет эту привязку.' : '';
  if (!window.confirm(`Удалить «${tvLabel(screen)}»?${warning}`)) return;
  try {
    await api.delete(`${API.screens}/${screen.id}`);
    pingByScreen.delete(Number(screen.id));
    await loadScreens({ measurePing:false });
  } catch (error) {
    setMessage('screens-message', error.message);
  }
}

async function createScreenAtLocation(location, sourceId) {
  try {
    const payload = sourceId ? { source_screen_id:Number(sourceId) } : {};
    const screen = await api.post(`${API.locations}/${location.id}/screens`, payload);
    await navigate(`/screen-editor?id=${screen.id}`);
  } catch (error) {
    setMessage('screens-message', error.message);
  }
}

export function initialiseScreens() {
  if (!document.querySelector('[data-screen-hierarchy]')) return undefined;
  let disposed = false;
  const refreshButton = element('refresh-screens');
  const fullRefresh = () => {
    if (disposed) return;
    void loadScreens({ measurePing:true }).catch((error) => setMessage('screens-message', error.message));
  };
  refreshButton?.addEventListener('click', fullRefresh);
  fullRefresh();
  statusTimer = setInterval(() => {
    if (disposed || document.visibilityState === 'hidden') return;
    void refreshRuntimeStatus().catch(() => undefined);
  }, STATUS_REFRESH_MS);

  return {
    dispose() {
      disposed = true;
      if (statusTimer) clearInterval(statusTimer);
      statusTimer = null;
      refreshButton?.removeEventListener('click', fullRefresh);
      previewDialog?.close();
      previewDialog?.remove();
      previewDialog = null;
      previewDialogScreenId = null;
      cacheDialog?.close();
      cacheDialog?.remove();
      cacheDialog = null;
      cacheDialogScreenId = null;
      pendingCacheCommand = null;
    }
  };
}
