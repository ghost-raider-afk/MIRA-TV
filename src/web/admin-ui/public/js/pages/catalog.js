import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { element, setMessage, clearMessage, setPending } from '../core/dom.js';
import { loadNotifications } from '../core/notifications.js';

const PRICING_LABELS = Object.freeze({
  fixed: 'Фиксированная цена за позицию.',
  proportional: 'Цена рассчитывается пропорционально указанному количеству.',
  weight: 'Цена рассчитывается пропорционально весу или количеству.',
  variant: 'Цена зависит от варианта позиции.'
});

function classById(id) {
  return (state.catalogClasses || []).find((item) => Number(item.id) === Number(id)) || null;
}

function classPath(item) {
  const lineage = Array.isArray(item?.lineage) ? item.lineage : [];
  return lineage.length ? lineage.map((entry) => entry.name).join(' › ') : String(item?.name || '');
}

function classDepth(item) {
  return Math.max(0, (Array.isArray(item?.lineage) ? item.lineage.length : 1) - 1);
}

function formatNumber(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? '');
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(number);
}

function formatPrice(item) {
  const price = Number(item?.base_price);
  const money = Number.isFinite(price)
    ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(price)} ₽`
    : '—';
  if (['proportional', 'weight'].includes(item?.pricing_model)) {
    return `${money} / ${formatNumber(item?.base_quantity || 1)} ${item?.unit || ''}`.trim();
  }
  if (item?.pricing_model === 'variant') return `${money} · по вариантам`;
  return money;
}

function normalizedQuery() {
  return String(element('catalog-filter')?.value || '').trim().toLocaleLowerCase('ru-RU');
}

function selectedClassCode() {
  return String(element('catalog-class-filter')?.value || '');
}

function matches(item, query, classCode) {
  if (classCode && item.class_code !== classCode) return false;
  if (!query) return true;
  const attributes = item.attributes && typeof item.attributes === 'object' ? Object.values(item.attributes) : [];
  return [item.name, item.description, item.class_name, ...attributes]
    .some((value) => String(value ?? '').toLocaleLowerCase('ru-RU').includes(query));
}

function button(label, className, handler) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = `small-button${className ? ` ${className}` : ''}`;
  node.textContent = label;
  node.addEventListener('click', handler);
  return node;
}

function statusBadge(item) {
  const node = document.createElement('span');
  node.className = `catalog-status${item.active === false ? ' is-inactive' : ' is-active'}`;
  node.textContent = item.active === false ? 'Скрыта' : 'Активна';
  return node;
}

function renderCatalog() {
  const body = element('catalog-items-body');
  const empty = element('catalog-empty');
  if (!body || !empty) return;
  const query = normalizedQuery();
  const classCode = selectedClassCode();
  const items = (state.catalogItems || []).filter((item) => matches(item, query, classCode));
  body.replaceChildren();

  for (const item of items) {
    const row = document.createElement('tr');
    const name = document.createElement('td');
    const title = document.createElement('strong');
    title.textContent = item.name;
    const description = document.createElement('small');
    description.textContent = item.description || '';
    name.append(title);
    if (description.textContent) name.append(description);

    const classCell = document.createElement('td');
    const className = document.createElement('span');
    className.className = 'catalog-class-name';
    className.textContent = item.class_name || item.class_code || '—';
    classCell.append(className);

    const priceCell = document.createElement('td');
    priceCell.className = 'catalog-price-cell';
    priceCell.textContent = formatPrice(item);

    const status = document.createElement('td');
    status.append(statusBadge(item));

    const actions = document.createElement('td');
    actions.className = 'catalog-row-actions';
    actions.append(
      button('Изменить', '', () => editItem(item)),
      button('Удалить', 'danger', () => void deleteItem(item))
    );
    row.append(name, classCell, priceCell, status, actions);
    body.append(row);
  }

  empty.classList.toggle('is-hidden', items.length > 0);
  if (!items.length) {
    empty.querySelector('strong').textContent = query || classCode ? 'Ничего не найдено' : 'Каталог пуст';
    empty.querySelector('span').textContent = query || classCode
      ? 'Измените поиск или фильтр класса.'
      : 'Добавьте первую позицию и выберите её класс.';
  }
}

function fillClassOptions() {
  const filter = element('catalog-class-filter');
  const select = element('catalog-item-class');
  if (!filter || !select) return;
  const currentFilter = filter.value;
  const currentSelect = select.value;
  const active = (state.catalogClasses || []).filter((item) => item.active !== false);
  filter.replaceChildren(new Option('Все классы', ''));
  select.replaceChildren(new Option('Выберите класс', ''));
  for (const item of active) {
    const prefix = classDepth(item) ? `${'— '.repeat(classDepth(item))}` : '';
    filter.append(new Option(`${prefix}${item.name}`, item.code));
    select.append(new Option(`${prefix}${item.name}`, String(item.id)));
  }
  filter.value = [...filter.options].some((option) => option.value === currentFilter) ? currentFilter : '';
  select.value = [...select.options].some((option) => option.value === currentSelect) ? currentSelect : '';
}

async function loadCatalog() {
  const [classes, items] = await Promise.all([api.get(API.catalogClasses), api.get(API.catalogItems)]);
  state.catalogClasses = Array.isArray(classes) ? classes : [];
  state.catalogItems = Array.isArray(items) ? items : [];
  fillClassOptions();
  renderCatalog();
}

function createFieldNode(field, value) {
  if (field.type === 'boolean') {
    const label = document.createElement('label');
    label.className = 'toggle-row';
    const copy = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = field.label;
    copy.append(strong);
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value === true;
    input.dataset.catalogAttribute = field.key;
    input.dataset.catalogAttributeType = field.type;
    const visual = document.createElement('i');
    visual.setAttribute('aria-hidden', 'true');
    label.append(copy, input, visual);
    return label;
  }

  const label = document.createElement('label');
  label.className = 'field';
  const caption = document.createElement('span');
  caption.textContent = field.label;
  let input;
  if (field.type === 'select') {
    input = document.createElement('select');
    if (!field.required) input.append(new Option('Не выбрано', ''));
    for (const option of field.options || []) input.append(new Option(option.label, option.value));
    input.value = value === undefined || value === null ? '' : String(value);
  } else {
    input = document.createElement('input');
    input.type = field.type === 'number' ? 'number' : 'text';
    if (field.type === 'number') {
      input.step = String(field.step || 1);
      if (Number.isFinite(Number(field.min))) input.min = String(field.min);
      if (Number.isFinite(Number(field.max))) input.max = String(field.max);
    } else if (field.max) {
      input.maxLength = Number(field.max);
    }
    input.value = value === undefined || value === null ? '' : String(value);
  }
  input.required = field.required === true;
  input.dataset.catalogAttribute = field.key;
  input.dataset.catalogAttributeType = field.type;
  label.append(caption, input);
  return label;
}

function renderClassFields(catalogClass, values = {}) {
  const root = element('catalog-class-fields');
  const body = element('catalog-class-fields-body');
  const description = element('catalog-class-description');
  const path = element('catalog-item-class-path');
  const hint = element('catalog-pricing-hint');
  if (!root || !body) return;
  body.replaceChildren();
  if (!catalogClass) {
    root.classList.add('is-hidden');
    if (description) description.textContent = '';
    if (path) path.textContent = '';
    if (hint) hint.textContent = '';
    return;
  }

  if (path) path.textContent = classPath(catalogClass);
  if (description) description.textContent = catalogClass.description || '';
  if (hint) hint.textContent = PRICING_LABELS[catalogClass.pricing_model] || '';
  for (const field of catalogClass.resolved_field_schema || []) {
    body.append(createFieldNode(field, values[field.key]));
  }
  root.classList.toggle('is-hidden', body.children.length === 0);
}

function collectAttributes() {
  const result = {};
  document.querySelectorAll('[data-catalog-attribute]').forEach((input) => {
    const key = input.dataset.catalogAttribute;
    const type = input.dataset.catalogAttributeType;
    if (!key) return;
    if (type === 'boolean') {
      result[key] = input.checked === true;
      return;
    }
    const value = String(input.value ?? '').trim();
    if (!value) return;
    result[key] = type === 'number' ? Number(value.replace(',', '.')) : value;
  });
  return result;
}

function openDrawer() {
  const drawer = element('catalog-item-drawer');
  if (!drawer) return;
  drawer.classList.remove('is-hidden');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('workspace-drawer-open');
  requestAnimationFrame(() => element('catalog-item-class')?.focus());
}

function closeDrawer() {
  const drawer = element('catalog-item-drawer');
  if (!drawer) return;
  drawer.classList.add('is-hidden');
  drawer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('workspace-drawer-open');
}

function resetForm({ close = false } = {}) {
  const form = element('catalog-item-form');
  if (!(form instanceof HTMLFormElement)) return;
  state.editingCatalogItemId = null;
  form.reset();
  element('catalog-item-active').checked = true;
  element('catalog-item-quantity').value = '1';
  element('catalog-item-form-title').textContent = 'Новая позиция';
  element('catalog-item-submit').textContent = 'Добавить';
  renderClassFields(null);
  clearMessage('catalog-message');
  if (close) closeDrawer();
}

function createItem() {
  resetForm();
  fillClassOptions();
  openDrawer();
}

function editItem(item) {
  state.editingCatalogItemId = item.id;
  fillClassOptions();
  element('catalog-item-class').value = String(item.class_id);
  element('catalog-item-name').value = item.name || '';
  element('catalog-item-description').value = item.description || '';
  element('catalog-item-price').value = item.base_price || '0';
  element('catalog-item-quantity').value = item.base_quantity || '1';
  element('catalog-item-unit').value = item.unit || '';
  element('catalog-item-active').checked = item.active !== false;
  element('catalog-item-form-title').textContent = 'Редактирование позиции';
  element('catalog-item-submit').textContent = 'Сохранить';
  renderClassFields(classById(item.class_id), item.attributes || {});
  clearMessage('catalog-message');
  openDrawer();
  requestAnimationFrame(() => element('catalog-item-name')?.focus());
}

async function deleteItem(item) {
  if (!window.confirm(`Удалить «${item.name}» из каталога?`)) return;
  clearMessage('catalog-message');
  try {
    await api.delete(`${API.catalogItems}/${item.id}`);
    await Promise.all([loadCatalog(), loadNotifications()]);
  } catch (error) {
    setMessage('catalog-message', error.message);
  }
}

function payload() {
  const classId = Number(element('catalog-item-class').value);
  return {
    class_id: classId,
    name: element('catalog-item-name').value,
    description: element('catalog-item-description').value,
    base_price: element('catalog-item-price').value,
    base_quantity: element('catalog-item-quantity').value,
    unit: element('catalog-item-unit').value,
    attributes: collectAttributes(),
    active: element('catalog-item-active').checked
  };
}

export function initialiseCatalog() {
  const form = element('catalog-item-form');
  if (!(form instanceof HTMLFormElement)) return;

  void loadCatalog().catch((error) => setMessage('catalog-message', error.message));

  element('create-catalog-item')?.addEventListener('click', createItem);
  element('refresh-catalog')?.addEventListener('click', () => { void loadCatalog().catch((error) => setMessage('catalog-message', error.message)); });
  element('catalog-filter')?.addEventListener('input', renderCatalog);
  element('catalog-class-filter')?.addEventListener('change', renderCatalog);
  element('catalog-item-cancel')?.addEventListener('click', () => resetForm({ close: true }));
  element('catalog-item-drawer-close')?.addEventListener('click', () => resetForm({ close: true }));
  element('catalog-item-drawer-backdrop')?.addEventListener('click', () => resetForm({ close: true }));
  element('catalog-item-class')?.addEventListener('change', () => {
    const selected = classById(element('catalog-item-class').value);
    renderClassFields(selected);
    if (selected) element('catalog-item-unit').value = selected.default_unit || 'шт';
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !element('catalog-item-drawer')?.classList.contains('is-hidden')) resetForm({ close: true });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = element('catalog-item-submit');
    setPending(submit, true, 'Сохраняем…');
    clearMessage('catalog-message');
    try {
      const body = payload();
      if (state.editingCatalogItemId) await api.put(`${API.catalogItems}/${state.editingCatalogItemId}`, body);
      else await api.post(API.catalogItems, body);
      resetForm({ close: true });
      await Promise.all([loadCatalog(), loadNotifications()]);
    } catch (error) {
      setMessage('catalog-message', error.message);
    } finally {
      setPending(submit, false, 'Сохраняем…');
    }
  });
}
