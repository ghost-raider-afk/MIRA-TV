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
  pingByScreen.set(Number(binding.screen_id), {
    ms:Number.isFinite(Number(binding.ping_ms)) ? Number(binding.ping_ms) : null,
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
  if (!ping || ping.connectedAt !== (binding.realtime_connected_at || null)) return '—';
  return Number.isFinite(ping.ms) ? `${Math.round(ping.ms)} мс` : '—';
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

function metaRows(screen, binding) {
  const status = statusState(binding);
  return [
    ['Статус', status.title, status.key],
    ['Последняя связь', latestSeen(binding) ? formatDate(latestSeen(binding)) : '—', ''],
    ['IP-адрес', binding?.remote_address || '—', ''],
    ['Ping', pingText(screen.id, binding), '']
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
  if (host) host.replaceChildren(createTvFace(screen, binding));
  const meta = unit.querySelector('[data-tv-meta]');
  if (meta) fillMeta(meta, screen, binding);
  const bindAction = unit.querySelector('[data-tv-bind-action]');
  const unbindAction = unit.querySelector('[data-tv-unbind-action]');
  if (bindAction) bindAction.hidden = Boolean(binding);
  if (unbindAction) unbindAction.hidden = !binding;
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
  bind.href = '/connect-tv';
  bind.textContent = 'Подключить';
  bind.dataset.tvBindAction = '';
  const unbind = makeButton('Отвязать', 'secondary', () => void unbindScreen(screen));
  unbind.dataset.tvUnbindAction = '';
  unbind.classList.add('screen-tv-unbind');
  const remove = makeButton('Удалить', 'danger', () => void deleteScreen(screen));
  actions.append(settings, scene, bind, unbind, remove);

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
}

async function refreshRuntimeStatus() {
  const bindings = await requestBindings({ measurePing:false });
  state.deviceBindings = bindings;
  document.querySelectorAll('[data-tv-unit][data-screen-id]').forEach((unit) => {
    const screen = state.screens.find((item) => Number(item.id) === Number(unit.dataset.screenId));
    if (screen) syncTvUnit(unit, screen, bindingForScreen(screen.id));
  });
  refreshOpenPreview();
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
    }
  };
}
