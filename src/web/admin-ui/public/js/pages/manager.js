import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { setMessage } from '../core/dom.js';
import { formatRussianCount } from '../core/ru-plural.js';
import { PlayerSceneRenderer } from '../player/player-scene-renderer.js';

const previewRenderers = new Map();
const screenContexts = new Map();
const contextPromises = new Map();
let fullscreenRenderer = null;
let fullscreenScreenId = null;
let fullscreenEntries = [];
let fullscreenIndex = -1;
let fullscreenRequestToken = 0;
let catalog = { products:[], packaging:[] };
let catalogMode = 'products';
let catalogSearchText = '';
let proposalTarget = null;

const FIELD_LABELS = Object.freeze({
  name:'Название',
  producer:'Производитель',
  address:'Адрес',
  characteristics:'Характеристики',
  strength:'Крепость',
  price_primary:'Цена 1 л',
  price_secondary:'Цена 1,5 л',
  alcoholic:'Алкогольная продукция',
  beverage_color:'Цвет напитка',
  filtration:'Фильтрация',
  unit_price:'Цена тары',
  active:'Активна'
});

const STATUS_LABELS = Object.freeze({
  pending:'Ожидает согласования',
  approved:'Принято',
  rejected:'Отклонено',
  conflict:'Конфликт'
});

function appName() {
  return state.site?.app_name || state.site?.application_name || state.session?.app_name || 'MIRA-TV';
}

function clearPreviewRenderers() {
  for (const renderer of previewRenderers.values()) renderer.destroy();
  previewRenderers.clear();
  screenContexts.clear();
  contextPromises.clear();
}

function destroyFullscreenRenderer() {
  fullscreenRenderer?.destroy();
  fullscreenRenderer = null;
  document.getElementById('manager-fullscreen-stage')?.replaceChildren();
}

function contextEndpoint(screenId) {
  return `${API.managerBase}/screens/${screenId}/context`;
}

function weatherEndpoint(screenId) {
  return `${API.managerBase}/screens/${screenId}/weather`;
}

async function fetchScreenContext(screenId) {
  const id = Number(screenId);
  const cached = screenContexts.get(id);
  if (cached) return cached;
  const pending = contextPromises.get(id);
  if (pending) return pending;
  const task = api.get(contextEndpoint(id))
    .then((context) => {
      screenContexts.set(id, context);
      return context;
    })
    .finally(() => contextPromises.delete(id));
  contextPromises.set(id, task);
  return task;
}

function canonicalStage(active = false) {
  const stage = document.createElement('div');
  stage.className = 'manager-canonical-stage';
  if (active) stage.dataset.playerActive = 'true';
  return stage;
}

async function hydratePreview(stage, screenId, loading) {
  try {
    const context = await fetchScreenContext(screenId);
    if (!stage.isConnected) return;
    previewRenderers.get(Number(screenId))?.destroy();
    const canonical = canonicalStage(false);
    stage.replaceChildren(canonical);
    const renderer = new PlayerSceneRenderer(canonical, { weatherEndpoint:weatherEndpoint(screenId) });
    previewRenderers.set(Number(screenId), renderer);
    await renderer.render(context);
  } catch (error) {
    if (stage.isConnected) {
      stage.replaceChildren(Object.assign(document.createElement('p'), {
        className:'manager-preview-empty',
        textContent:error.message
      }));
    }
  } finally {
    loading?.classList.add('is-hidden');
  }
}

function screenAspectRatio(resolution) {
  const match = String(resolution || '').match(/(\d+)\D+(\d+)/);
  const width = Number(match?.[1]) || 1920;
  const height = Number(match?.[2]) || 1080;
  return `${width} / ${height}`;
}

function screenCard(screen, location, orderIndex) {
  const card = document.createElement('button');
  card.className = 'manager-screen-card';
  card.type = 'button';
  card.dataset.managerScreenId = String(screen.id);

  const shell = document.createElement('div');
  shell.className = 'manager-screen-preview-shell';
  shell.style.aspectRatio = screenAspectRatio(screen.resolution);
  const stage = document.createElement('div');
  stage.className = 'manager-screen-stage';
  const loading = document.createElement('div');
  loading.className = 'manager-preview-loading';
  loading.textContent = 'Загружаем актуальное состояние…';
  shell.append(stage, loading);

  const copy = document.createElement('div');
  copy.className = 'manager-screen-copy';
  const name = document.createElement('strong');
  name.textContent = screen.name;
  const meta = document.createElement('span');
  meta.className = 'manager-screen-meta';
  meta.textContent = screen.resolution;
  copy.append(name, meta);
  card.append(shell, copy);
  card.addEventListener('click', () => void openFullscreenAt(orderIndex));
  return card;
}

function discardLocationPreviews(location) {
  for (const screen of location.screens) {
    const id = Number(screen.id);
    previewRenderers.get(id)?.destroy();
    previewRenderers.delete(id);
    screenContexts.delete(id);
    contextPromises.delete(id);
  }
}

function renderLocations(locations) {
  const root = document.getElementById('manager-locations');
  const empty = document.getElementById('manager-empty');
  if (!root || !empty) return;
  clearPreviewRenderers();
  root.replaceChildren();
  fullscreenEntries = locations.flatMap((location) =>
    location.screens.map((screen) => ({ screen, location }))
  );
  const orderIndexByScreenId = new Map(
    fullscreenEntries.map((entry, index) => [Number(entry.screen.id), index])
  );
  for (const location of locations) {
    const group = document.createElement('article');
    group.className = 'manager-location';
    const head = document.createElement('header');
    head.className = 'manager-location-head';
    const identity = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = location.name;
    const address = document.createElement('p');
    address.textContent = location.address || 'Адрес не указан';
    identity.append(title, address);
    const count = document.createElement('span');
    count.className = 'manager-location-count';
    count.textContent = formatRussianCount(location.screens.length, ['телевизор','телевизора','телевизоров']);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'manager-location-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    const grid = document.createElement('div');
    grid.className = 'manager-screen-grid';
    grid.id = `manager-location-screens-${location.id}`;
    grid.hidden = true;
    toggle.setAttribute('aria-controls', grid.id);
    const label = document.createElement('span');
    label.className = 'manager-location-toggle-label';
    label.textContent = 'Развернуть';
    const arrow = document.createElement('span');
    arrow.className = 'manager-location-chevron';
    arrow.setAttribute('aria-hidden', 'true');
    toggle.append(identity, count, label, arrow);
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(expanded));
      label.textContent = expanded ? 'Свернуть' : 'Развернуть';
      if (expanded) {
        grid.hidden = false;
        location.screens.forEach((screen) => {
          const card = screenCard(screen, location, orderIndexByScreenId.get(Number(screen.id)));
          grid.append(card);
          void hydratePreview(card.querySelector('.manager-screen-stage'), screen.id, card.querySelector('.manager-preview-loading'));
        });
      } else {
        grid.hidden = true;
        discardLocationPreviews(location);
        grid.replaceChildren();
      }
    });
    head.append(toggle);
    group.append(head, grid);
    root.append(group);
  }
  empty.classList.toggle('is-hidden', locations.length !== 0);
}

async function loadOverview() {
  const locations = await api.get(API.managerOverview);
  renderLocations(Array.isArray(locations) ? locations : []);
}

function updateFullscreenNavigation() {
  const previous = document.getElementById('manager-fullscreen-prev');
  const next = document.getElementById('manager-fullscreen-next');
  const hasCurrent = fullscreenIndex >= 0 && fullscreenIndex < fullscreenEntries.length;
  if (previous) previous.disabled = !hasCurrent || fullscreenIndex === 0;
  if (next) next.disabled = !hasCurrent || fullscreenIndex >= fullscreenEntries.length - 1;
}

function openFullscreenAt(index) {
  if (!Number.isInteger(index) || index < 0 || index >= fullscreenEntries.length) return Promise.resolve();
  const entry = fullscreenEntries[index];
  return openFullscreen(entry.screen, entry.location, index);
}

function moveFullscreen(delta) {
  if (!Number.isInteger(fullscreenIndex)) return;
  const target = fullscreenIndex + delta;
  if (target < 0 || target >= fullscreenEntries.length) return;
  void openFullscreenAt(target);
}

async function openFullscreen(screen, location, orderIndex) {
  const overlay = document.getElementById('manager-fullscreen');
  const stage = document.getElementById('manager-fullscreen-stage');
  if (!(overlay instanceof HTMLElement) || !(stage instanceof HTMLElement)) return;

  const requestToken = ++fullscreenRequestToken;
  fullscreenScreenId = screen.id;
  fullscreenIndex = orderIndex;
  updateFullscreenNavigation();
  destroyFullscreenRenderer();
  stage.replaceChildren(Object.assign(document.createElement('p'), {
    className:'manager-preview-empty is-fullscreen',
    textContent:'Открываем актуальное состояние…'
  }));
  document.getElementById('manager-fullscreen-title').textContent = screen.name;
  document.getElementById('manager-fullscreen-subtitle').textContent = `${location.name} · ${screen.resolution}`;
  overlay.classList.remove('is-hidden');

  if (!document.fullscreenElement && overlay.requestFullscreen) {
    void overlay.requestFullscreen({ navigationUI:'hide' }).catch(() => undefined);
  }

  try {
    const context = await fetchScreenContext(screen.id);
    if (requestToken !== fullscreenRequestToken || fullscreenScreenId !== screen.id || overlay.classList.contains('is-hidden')) return;
    const canonical = canonicalStage(true);
    stage.replaceChildren(canonical);
    fullscreenRenderer = new PlayerSceneRenderer(canonical, { weatherEndpoint:weatherEndpoint(screen.id) });
    await fullscreenRenderer.render(context);
  } catch (error) {
    if (requestToken !== fullscreenRequestToken) return;
    stage.replaceChildren(Object.assign(document.createElement('p'), {
      className:'manager-preview-empty is-fullscreen',
      textContent:error.message
    }));
  }
}

async function closeFullscreen() {
  fullscreenRequestToken += 1;
  fullscreenScreenId = null;
  fullscreenIndex = -1;
  updateFullscreenNavigation();
  destroyFullscreenRenderer();
  const overlay = document.getElementById('manager-fullscreen');
  overlay?.classList.add('is-hidden');
  if (document.fullscreenElement === overlay) await document.exitFullscreen().catch(() => undefined);
}

function formatPrice(value) {
  const text = String(value ?? '').trim();
  return text ? `${text.replace('.', ',')} ₽` : '—';
}

function catalogRecords() {
  return catalogMode === 'packaging' ? catalog.packaging : catalog.products;
}

function catalogMeta(item) {
  if (catalogMode === 'packaging') return formatPrice(item.unit_price);
  const parts = [formatPrice(item.price_primary), item.producer, item.strength].filter(Boolean);
  return parts.join(' · ');
}

function renderCatalog() {
  const list = document.getElementById('manager-catalog-list');
  const empty = document.getElementById('manager-catalog-empty');
  if (!list || !empty) return;
  list.replaceChildren();
  const records = catalogRecords().filter((item) => {
    const query = catalogSearchText.trim().toLocaleLowerCase('ru');
    if (!query) return true;
    return [item.name, ...(catalogMode === 'products' ? [item.producer] : [])]
      .some((value) => String(value || '').toLocaleLowerCase('ru').includes(query));
  });
  const count = document.getElementById('manager-catalog-count');
  if (count) count.textContent = `${records.length} из ${catalogRecords().length}`;
  empty.textContent = catalogSearchText.trim() ? 'Ничего не найдено.' : 'Каталог пуст.';
  for (const item of records) {
    const row = document.createElement('div');
    row.className = 'manager-catalog-row';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = item.name || 'Без названия';
    const meta = document.createElement('span');
    meta.textContent = catalogMeta(item);
    copy.append(title, meta);
    const propose = document.createElement('button');
    propose.className = 'button button-secondary';
    propose.type = 'button';
    propose.textContent = 'Изменить';
    propose.addEventListener('click', () => openProposal(catalogMode === 'packaging' ? 'packaging' : 'product', item));
    row.append(copy, propose);
    list.append(row);
  }
  empty.classList.toggle('is-hidden', records.length !== 0);
  document.getElementById('manager-tab-products')?.classList.toggle('is-active', catalogMode === 'products');
  document.getElementById('manager-tab-packaging')?.classList.toggle('is-active', catalogMode === 'packaging');
}

async function loadCatalog() {
  const response = await api.get(API.managerCatalog);
  catalog = {
    products:Array.isArray(response?.products) ? response.products : [],
    packaging:Array.isArray(response?.packaging) ? response.packaging : []
  };
  renderCatalog();
}

function formatValue(value) {
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

function proposalChanges(proposal) {
  const base = proposal?.base_payload || {};
  const proposed = proposal?.proposed_payload || {};
  return Object.keys(proposed)
    .filter((key) => JSON.stringify(base[key] ?? null) !== JSON.stringify(proposed[key] ?? null))
    .map((key) => ({ key, label:FIELD_LABELS[key] || key, before:base[key], after:proposed[key] }));
}

function renderProposals(proposals) {
  const list = document.getElementById('manager-proposal-list');
  const empty = document.getElementById('manager-proposals-empty');
  if (!list || !empty) return;
  list.replaceChildren();
  for (const proposal of proposals) {
    const card = document.createElement('article');
    card.className = `manager-proposal-card status-${proposal.status}`;
    const head = document.createElement('header');
    const title = document.createElement('strong');
    title.textContent = proposal.base_payload?.name || `${proposal.entity_type === 'product' ? 'Продукция' : 'Тара'} #${proposal.entity_id}`;
    const status = document.createElement('span');
    status.className = 'manager-proposal-status';
    status.textContent = STATUS_LABELS[proposal.status] || proposal.status;
    head.append(title, status);
    const changes = document.createElement('div');
    changes.className = 'manager-proposal-changes';
    for (const change of proposalChanges(proposal)) {
      const line = document.createElement('p');
      line.textContent = `${change.label}: ${formatValue(change.before)} → ${formatValue(change.after)}`;
      changes.append(line);
    }
    if (!changes.childElementCount) {
      const line = document.createElement('p');
      line.textContent = 'Значения не изменены.';
      changes.append(line);
    }
    card.append(head, changes);
    if (proposal.review_comment) {
      const comment = document.createElement('p');
      comment.className = 'manager-proposal-comment';
      comment.textContent = `Комментарий администратора: ${proposal.review_comment}`;
      card.append(comment);
    }
    list.append(card);
  }
  empty.classList.toggle('is-hidden', proposals.length !== 0);
}

async function loadProposals() {
  const proposals = await api.get(API.managerProposals);
  renderProposals(Array.isArray(proposals) ? proposals : []);
}

function textField(label, name, value = '', { type = 'text', maxLength = 180 } = {}) {
  const field = document.createElement('label');
  field.className = 'manager-proposal-field';
  const caption = document.createElement('span');
  caption.textContent = label;
  const input = document.createElement('input');
  input.name = name;
  input.type = type;
  input.maxLength = maxLength;
  input.value = value ?? '';
  field.append(caption, input);
  return field;
}

function selectField(label, name, value, options) {
  const field = document.createElement('label');
  field.className = 'manager-proposal-field';
  const caption = document.createElement('span');
  caption.textContent = label;
  const select = document.createElement('select');
  select.name = name;
  for (const [optionValue, optionLabel] of options) select.add(new Option(optionLabel, optionValue));
  select.value = value || options[0]?.[0] || '';
  field.append(caption, select);
  return field;
}

function checkboxField(label, name, checked) {
  const field = document.createElement('label');
  field.className = 'manager-proposal-checkbox';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.name = name;
  input.checked = checked === true;
  const caption = document.createElement('span');
  caption.textContent = label;
  field.append(input, caption);
  return field;
}

function openProposal(entityType, record) {
  proposalTarget = { entityType, record };
  const dialog = document.getElementById('manager-proposal-dialog');
  const fields = document.getElementById('manager-proposal-fields');
  if (!(dialog instanceof HTMLDialogElement) || !(fields instanceof HTMLElement)) return;
  fields.replaceChildren();
  document.getElementById('manager-proposal-title').textContent = record.name || 'Каталог';
  setMessage('manager-proposal-message', '');

  if (entityType === 'product') {
    fields.append(
      textField('Название', 'name', record.name, { maxLength:120 }),
      textField('Цена за 1 л', 'price_primary', record.price_primary, { maxLength:16 }),
      textField('Производитель', 'producer', record.producer, { maxLength:120 }),
      textField('Адрес', 'address', record.address, { maxLength:180 }),
      textField('Характеристики', 'characteristics', record.characteristics, { maxLength:180 }),
      textField('Крепость', 'strength', record.strength, { maxLength:20 }),
      selectField('Цвет напитка', 'beverage_color', record.beverage_color, [
        ['none','Не задан'],['light','Светлое'],['dark','Тёмное'],['white','Белое'],['semi_dark','Полутёмное'],['amber','Янтарное'],['red','Красное']
      ]),
      selectField('Фильтрация', 'filtration', record.filtration, [['none','Не задана'],['filtered','Фильтрованное'],['unfiltered','Нефильтрованное']]),
      checkboxField('Алкогольная продукция', 'alcoholic', record.alcoholic),
      checkboxField('Активна', 'active', record.active !== false)
    );
  } else {
    fields.append(
      textField('Название', 'name', record.name, { maxLength:120 }),
      textField('Цена тары', 'unit_price', record.unit_price, { maxLength:16 }),
      checkboxField('Активна', 'active', record.active !== false)
    );
  }
  dialog.showModal();
}

function proposalPayload() {
  const fields = document.getElementById('manager-proposal-fields');
  if (!(fields instanceof HTMLElement) || !proposalTarget) return null;
  const value = (name) => fields.querySelector(`[name="${name}"]`)?.value ?? '';
  const checked = (name) => fields.querySelector(`[name="${name}"]`)?.checked === true;
  if (proposalTarget.entityType === 'product') {
    return {
      name:value('name'),
      price_primary:value('price_primary'),
      producer:value('producer'),
      address:value('address'),
      characteristics:value('characteristics'),
      strength:value('strength'),
      beverage_color:value('beverage_color'),
      filtration:value('filtration'),
      alcoholic:checked('alcoholic'),
      active:checked('active')
    };
  }
  return { name:value('name'), unit_price:value('unit_price'), active:checked('active') };
}

async function submitProposal() {
  if (!proposalTarget) return;
  const button = document.getElementById('manager-proposal-submit');
  if (button) button.disabled = true;
  try {
    await api.post(API.managerProposals, {
      entity_type:proposalTarget.entityType,
      entity_id:proposalTarget.record.id,
      proposed:proposalPayload()
    });
    document.getElementById('manager-proposal-dialog')?.close();
    proposalTarget = null;
    await loadProposals();
    setMessage('manager-message', 'Предложение отправлено администратору.', 'success');
  } catch (error) {
    setMessage('manager-proposal-message', error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

async function loadWorkspace() {
  const button = document.getElementById('manager-refresh');
  if (button) button.disabled = true;
  try {
    await Promise.all([loadOverview(), loadCatalog(), loadProposals()]);
    setMessage('manager-message', '');
  } catch (error) {
    setMessage('manager-message', error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

async function logout() {
  try { await api.post(API.logout); }
  finally { window.location.replace('/signin'); }
}

export function initialiseManagerView() {
  document.title = `${appName()} — Рабочее место менеджера`;
  const app = document.querySelector('[data-manager-app-name]');
  const user = document.querySelector('[data-manager-user]');
  if (app) app.textContent = appName();
  if (user) user.textContent = state.session?.display_name || state.session?.username || '';
  document.getElementById('manager-refresh')?.addEventListener('click', () => void loadWorkspace());
  document.getElementById('manager-logout')?.addEventListener('click', () => void logout());
  document.getElementById('manager-fullscreen-close')?.addEventListener('click', () => void closeFullscreen());
  document.getElementById('manager-fullscreen-prev')?.addEventListener('click', () => moveFullscreen(-1));
  document.getElementById('manager-fullscreen-next')?.addEventListener('click', () => moveFullscreen(1));
  const search = document.getElementById('manager-catalog-search');
  const setMode = (mode) => {
    catalogMode = mode;
    catalogSearchText = '';
    if (search) {
      search.value = '';
      search.placeholder = mode === 'products' ? 'Поиск по названию или производителю' : 'Поиск тары по названию';
      search.setAttribute('aria-label', search.placeholder);
    }
    renderCatalog();
  };
  search?.addEventListener('input', () => { catalogSearchText = search.value; renderCatalog(); });
  document.getElementById('manager-tab-products')?.addEventListener('click', () => setMode('products'));
  document.getElementById('manager-tab-packaging')?.addEventListener('click', () => setMode('packaging'));
  document.getElementById('manager-proposal-submit')?.addEventListener('click', () => void submitProposal());
  document.getElementById('manager-proposal-dialog')?.addEventListener('close', () => { proposalTarget = null; });
  document.addEventListener('keydown', (event) => {
    const overlay = document.getElementById('manager-fullscreen');
    if (!overlay || overlay.classList.contains('is-hidden')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      void closeFullscreen();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveFullscreen(-1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveFullscreen(1);
    }
  });
  document.addEventListener('fullscreenchange', () => {
    const overlay = document.getElementById('manager-fullscreen');
    if (!document.fullscreenElement && overlay && !overlay.classList.contains('is-hidden')) void closeFullscreen();
  });
  window.addEventListener('pagehide', () => {
    clearPreviewRenderers();
    destroyFullscreenRenderer();
  }, { once:true });
  void loadWorkspace();
}
