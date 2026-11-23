import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, price, setMessage } from '../core/dom.js';
import { state } from '../core/state.js';

const FIELD_NAMES = Object.freeze({
  name: 'Название', producer: 'Производитель', address: 'Адрес',
  characteristics: 'Характеристики', strength: 'Крепость',
  price_primary: 'Цена 1 л', price_secondary: 'Цена 1,5 л (расчётная)',
  alcoholic: 'Алкогольная', beverage_color: 'Цвет напитка', filtration: 'Фильтрация',
  active: 'Доступность', archived_at: 'Архив', deleted_at: 'Корзина'
});
const ACTION_NAMES = Object.freeze({
  legacy: 'Создан до начала ведения журнала',
  created: 'Товар создан', updated: 'Изменения товара',
  archived: 'Перенесён в архив', unarchived: 'Возвращён из архива',
  deleted: 'Перенесён в корзину', restored: 'Восстановлен из корзины'
});

function dateTime(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString('ru-RU') : 'Не указано';
}

function valueText(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (value === true) return 'Да';
  if (value === false) return 'Нет';
  if (typeof value === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}T/.test(value)) return dateTime(value);
  return String(value);
}

function detailRow(label, value) {
  const row = document.createElement('div');
  row.className = 'catalog-detail-field';
  const key = document.createElement('dt');
  key.textContent = label;
  const text = document.createElement('dd');
  text.textContent = valueText(value);
  row.append(key, text);
  return row;
}

export function initialiseProductDetails({ onEdit, onDelete, onChange }) {
  const dialog = element('product-detail-dialog');
  if (!(dialog instanceof HTMLDialogElement)) return () => {};
  const title = element('product-detail-title');
  const subtitle = element('product-detail-subtitle');
  const info = element('product-detail-info');
  const history = element('product-detail-history');
  const usage = element('product-detail-usage');
  const loadMore = element('product-history-more');
  const archive = element('product-detail-archive');
  const tabs = Array.from(dialog.querySelectorAll('[data-product-detail-tab]'));
  const panels = Array.from(dialog.querySelectorAll('[data-product-detail-panel]'));
  let selectedId = null;
  let cursor = null;
  let historyLoaded = false;
  let usageLoaded = false;
  let historyLoading = false;
  let detailVersion = 0;

  function current() {
    return state.products.find((product) => Number(product.id) === Number(selectedId));
  }

  function renderInfo() {
    const product = current();
    if (!product) return;
    title.textContent = product.name;
    subtitle.textContent = `Товар #${product.id} · ${product.archived_at ? 'В архиве' : product.active ? 'Активен' : 'Скрыт'}`;
    archive.textContent = product.archived_at ? 'Вернуть из архива' : 'Архивировать';
    info.replaceChildren(
      detailRow('Производитель', product.producer),
      detailRow('Адрес', product.address),
      detailRow('Характеристики', product.characteristics),
      detailRow('Крепость', product.strength),
      detailRow('Цена за 1 л', price(product.price_primary)),
      detailRow('Цена за 1,5 л (расчётная)', price(product.price_secondary)),
      detailRow('Алкогольная', product.alcoholic),
      detailRow('Цвет напитка', product.beverage_color),
      detailRow('Фильтрация', product.filtration),
      detailRow('Создан', dateTime(product.created_at)),
      detailRow('Изменён', dateTime(product.updated_at)),
      ...(product.archived_at ? [detailRow('Архивирован', dateTime(product.archived_at))] : [])
    );
  }

  function historyEvent(entry) {
    const node = document.createElement('article');
    node.className = 'catalog-history-event';
    const heading = document.createElement('strong');
    heading.textContent = ACTION_NAMES[entry.action] || 'Изменение';
    const meta = document.createElement('small');
    meta.textContent = `${dateTime(entry.occurred_at)} · ${entry.actor_username || 'Неизвестен'}`;
    node.append(heading, meta);
    if (entry.action === 'legacy') {
      const warning = document.createElement('p');
      warning.textContent = 'Изменения до внедрения журнала недоступны.';
      node.append(warning);
      return node;
    }
    for (const [field, diff] of Object.entries(entry.changes || {})) {
      if (!Object.hasOwn(FIELD_NAMES, field)) continue;
      const line = document.createElement('p');
      line.textContent = `${FIELD_NAMES[field]}: ${valueText(diff?.before)} → ${valueText(diff?.after)}`;
      node.append(line);
    }
    return node;
  }

  async function loadHistory() {
    if (historyLoading || (historyLoaded && cursor === null)) return;
    const requestedId = selectedId;
    const requestedVersion = detailVersion;
    historyLoading = true;
    loadMore.disabled = true;
    try {
      const url = `${API.products}/${selectedId}/history${cursor ? `?before=${cursor}` : ''}`;
      const result = await api.get(url);
      if (requestedId !== selectedId || requestedVersion !== detailVersion) return;
      history.append(...(result.items || []).map(historyEvent));
      cursor = result.next_cursor;
      historyLoaded = true;
      loadMore.hidden = !cursor;
      if (!history.children.length) history.textContent = 'История изменений пока отсутствует.';
    } catch (error) {
      setMessage('product-message', error.message);
    } finally {
      if (requestedId === selectedId && requestedVersion === detailVersion) {
        historyLoading = false;
        loadMore.disabled = false;
      }
    }
  }

  async function loadUsage() {
    if (usageLoaded) return;
    const requestedId = selectedId;
    const requestedVersion = detailVersion;
    try {
      const screens = await api.get(`${API.products}/${selectedId}/usage`);
      if (requestedId !== selectedId || requestedVersion !== detailVersion) return;
      const groups = new Map();
      for (const screen of screens) {
        const location = screen.location_name || 'Неизвестная точка';
        if (!groups.has(location)) groups.set(location, []);
        groups.get(location).push(screen);
      }
      const nodes = [];
      for (const [location, entries] of groups) {
        const section = document.createElement('section');
        section.className = 'catalog-usage-location';
        const heading = document.createElement('strong');
        heading.textContent = location;
        section.append(heading);
        for (const entry of entries) {
          const item = document.createElement('p');
          item.textContent = `${entry.screen_name || 'ТВ'} · ID #${entry.screen_id}`;
          section.append(item);
        }
        nodes.push(section);
      }
      if (!nodes.length) usage.textContent = 'Товар сейчас не используется в меню ТВ.';
      else usage.replaceChildren(...nodes);
      usageLoaded = true;
    } catch (error) {
      setMessage('product-message', error.message);
    }
  }

  function activateTab(tab) {
    tabs.forEach((button) => {
      const selected = button.dataset.productDetailTab === tab;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-selected', String(selected));
    });
    panels.forEach((panel) => { panel.hidden = panel.dataset.productDetailPanel !== tab; });
    if (tab === 'history') void loadHistory();
    if (tab === 'usage') void loadUsage();
  }

  function resetDetails(id) {
    detailVersion += 1;
    selectedId = Number(id);
    cursor = null;
    historyLoaded = false;
    usageLoaded = false;
    historyLoading = false;
    history.replaceChildren();
    usage.replaceChildren();
    loadMore.hidden = true;
    renderInfo();
    activateTab('info');
  }

  async function changeArchive() {
    const product = current();
    if (!product) return;
    archive.disabled = true;
    try {
      await api.post(`${API.products}/${product.id}/${product.archived_at ? 'unarchive' : 'archive'}`, {});
      await onChange();
      resetDetails(product.id);
    } catch (error) {
      setMessage('product-message', error.message);
    } finally {
      archive.disabled = false;
    }
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => activateTab(tab.dataset.productDetailTab)));
  loadMore.addEventListener('click', () => void loadHistory());
  archive.addEventListener('click', () => void changeArchive());
  element('product-detail-edit')?.addEventListener('click', () => {
    const product = current();
    if (!product) return;
    dialog.close();
    onEdit(product);
  });
  element('product-detail-delete')?.addEventListener('click', async () => {
    const product = current();
    if (product && await onDelete(product)) dialog.close();
  });
  element('product-detail-close')?.addEventListener('click', () => dialog.close());

  return (product) => {
    if (!product) return;
    resetDetails(product.id);
    if (!dialog.open) dialog.showModal();
  };
}
