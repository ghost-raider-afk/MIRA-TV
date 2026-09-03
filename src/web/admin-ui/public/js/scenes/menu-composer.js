import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { getScene, updateSceneRemote } from './store.js';

function sceneId() {
  return new URLSearchParams(window.location.search).get('id') || '';
}

function selectedTableId() {
  return document.querySelector('#scene-elements-layer .scene-element-table.is-selected[data-element-id]')?.dataset?.elementId || '';
}

function findElement(scene, id) {
  for (const slide of scene?.slides || []) {
    const element = (slide.elements || []).find((item) => item.id === id);
    if (element) return element;
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function flushEditorSave() {
  const state = document.querySelector('#scene-save-state');
  document.querySelector('#scene-save')?.click();
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const text = String(state?.textContent || '').trim();
    if (text === 'Сохранено') return;
    if (/Не сохранено|Конфликт|Ошибка/i.test(text)) throw new Error('Сначала устраните ошибку сохранения сцены.');
    await sleep(90);
  }
  throw new Error('Не удалось дождаться сохранения сцены.');
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(number) : '—';
}

function classLabel(item) {
  return item.class_name || item.class_code || 'Без класса';
}

function createComposer({ items, classes, views, currentView, onSave }) {
  const root = document.createElement('section');
  root.className = 'menu-composer';
  root.innerHTML = `
    <div class="menu-composer-dialog">
      <header class="menu-composer-head">
        <div><p class="eyebrow">СОСТАВ МЕНЮ</p><h2>${currentView ? 'Редактировать подборку' : 'Новая подборка'}</h2><p>Каталог остаётся общей базой. Здесь выбирается только то, что попадёт в конкретное меню, и задаётся порядок показа.</p></div>
        <button type="button" data-menu-close aria-label="Закрыть">×</button>
      </header>
      <div class="menu-composer-toolbar">
        <label class="field"><span>Название подборки</span><input data-menu-name maxlength="120" /></label>
        <label class="field"><span>Поиск</span><input data-menu-search placeholder="Название, класс…" /></label>
        <label class="field"><span>Класс</span><select data-menu-class><option value="">Все классы</option></select></label>
      </div>
      <div class="menu-composer-workspace">
        <section class="menu-composer-catalog"><header><strong>Каталог</strong><span data-menu-catalog-count></span></header><div data-menu-catalog-list></div></section>
        <section class="menu-composer-selected"><header><strong>В меню</strong><span data-menu-selected-count></span></header><div data-menu-selected-list></div></section>
      </div>
      <footer class="menu-composer-footer"><span data-menu-message></span><div><button class="button button-secondary" type="button" data-menu-close>Отмена</button><button class="button button-primary" type="button" data-menu-save>Сохранить и применить</button></div></footer>
    </div>`;

  const classSelect = root.querySelector('[data-menu-class]');
  (classes || []).filter((item) => item?.active !== false).forEach((item) => classSelect.append(new Option(item.name, item.code)));
  const nameInput = root.querySelector('[data-menu-name]');
  nameInput.value = currentView?.name || 'Основное меню';
  const selected = [...new Set((currentView?.item_ids || []).map(Number).filter(Number.isSafeInteger))];
  const itemMap = new Map(items.map((item) => [Number(item.id), item]));

  function filters() {
    return {
      search: root.querySelector('[data-menu-search]').value.trim().toLocaleLowerCase('ru-RU'),
      classCode: classSelect.value
    };
  }

  function visibleItems() {
    const { search, classCode } = filters();
    return items.filter((item) => {
      if (classCode && item.class_code !== classCode) return false;
      if (!search) return true;
      return `${item.name} ${classLabel(item)} ${item.description || ''}`.toLocaleLowerCase('ru-RU').includes(search);
    });
  }

  function move(id, delta) {
    const index = selected.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= selected.length) return;
    [selected[index], selected[target]] = [selected[target], selected[index]];
    render();
  }

  function toggle(id, checked) {
    const index = selected.indexOf(id);
    if (checked && index < 0) selected.push(id);
    if (!checked && index >= 0) selected.splice(index, 1);
    render();
  }

  function render() {
    const catalog = root.querySelector('[data-menu-catalog-list]');
    const shown = visibleItems();
    catalog.replaceChildren();
    for (const item of shown) {
      const label = document.createElement('label');
      label.className = 'menu-composer-item';
      label.innerHTML = `<input type="checkbox"><span><strong></strong><small></small></span><b></b>`;
      const checkbox = label.querySelector('input');
      checkbox.checked = selected.includes(Number(item.id));
      label.querySelector('strong').textContent = item.name;
      label.querySelector('small').textContent = classLabel(item);
      label.querySelector('b').textContent = `${money(item.base_price)} ₽`;
      checkbox.addEventListener('change', () => toggle(Number(item.id), checkbox.checked));
      catalog.append(label);
    }
    root.querySelector('[data-menu-catalog-count]').textContent = `${shown.length} из ${items.length}`;

    const chosen = root.querySelector('[data-menu-selected-list]');
    chosen.replaceChildren();
    selected.forEach((id, index) => {
      const item = itemMap.get(id);
      if (!item) return;
      const row = document.createElement('div');
      row.className = 'menu-composer-selected-row';
      row.innerHTML = `<span class="menu-composer-order"></span><span class="menu-composer-selected-copy"><strong></strong><small></small></span><div><button type="button" title="Выше">↑</button><button type="button" title="Ниже">↓</button><button type="button" title="Убрать">×</button></div>`;
      row.querySelector('.menu-composer-order').textContent = String(index + 1);
      row.querySelector('strong').textContent = item.name;
      row.querySelector('small').textContent = classLabel(item);
      const buttons = row.querySelectorAll('button');
      buttons[0].disabled = index === 0;
      buttons[1].disabled = index === selected.length - 1;
      buttons[0].addEventListener('click', () => move(id, -1));
      buttons[1].addEventListener('click', () => move(id, 1));
      buttons[2].addEventListener('click', () => toggle(id, false));
      chosen.append(row);
    });
    root.querySelector('[data-menu-selected-count]').textContent = `${selected.length} поз.`;
  }

  root.querySelector('[data-menu-search]').addEventListener('input', render);
  classSelect.addEventListener('change', render);
  root.querySelectorAll('[data-menu-close]').forEach((button) => button.addEventListener('click', () => root.remove()));
  root.addEventListener('click', (event) => { if (event.target === root) root.remove(); });
  root.querySelector('[data-menu-save]').addEventListener('click', async () => {
    const message = root.querySelector('[data-menu-message]');
    const name = nameInput.value.trim();
    if (!name) { message.textContent = 'Введите название подборки.'; return; }
    if (!selected.length) { message.textContent = 'Выберите хотя бы одну позицию.'; return; }
    const button = root.querySelector('[data-menu-save]');
    button.disabled = true;
    message.textContent = 'Сохраняем…';
    try {
      await onSave({ name, description: '', active: true, item_ids: selected });
      root.remove();
    } catch (error) {
      button.disabled = false;
      message.textContent = error?.message || 'Не удалось сохранить подборку.';
    }
  });
  render();
  return root;
}

export async function initialiseSceneMenuComposer() {
  if (document.querySelector('#menu-view-controls')) return;
  const tableSettings = document.querySelector('#table-settings .scene-table-settings');
  if (!tableSettings) return;
  const id = sceneId();
  if (!id) return;

  let [scene, views, items, classes] = await Promise.all([
    getScene(id), api.get(API.catalogViews), api.get(API.catalogItems), api.get(API.catalogClasses)
  ]);
  views = Array.isArray(views) ? views : [];
  items = Array.isArray(items) ? items : [];
  classes = Array.isArray(classes) ? classes : [];

  const controls = document.createElement('section');
  controls.id = 'menu-view-controls';
  controls.className = 'menu-view-controls';
  controls.innerHTML = `<div><strong>Состав меню</strong><small>Выберите сохранённую подборку или соберите новую из каталога.</small></div><label class="field"><span>Подборка</span><select data-menu-view><option value="0">Все позиции каталога</option></select></label><button type="button" class="button button-secondary" data-menu-compose>Настроить состав</button><small data-menu-view-status></small>`;
  tableSettings.prepend(controls);
  const select = controls.querySelector('[data-menu-view]');
  const status = controls.querySelector('[data-menu-view-status]');

  function refillViews() {
    select.replaceChildren(new Option('Все позиции каталога', '0'));
    views.forEach((view) => select.append(new Option(`${view.name} · ${view.item_ids.length}`, String(view.id))));
  }

  function currentTable() {
    const elementId = selectedTableId();
    const element = elementId ? findElement(scene, elementId) : null;
    return element?.type === 'table' ? element : null;
  }

  function sync() {
    const table = currentTable();
    controls.classList.toggle('is-hidden', !table);
    if (!table) return;
    const viewId = Number(table.table?.view_id) || 0;
    select.value = [...select.options].some((option) => Number(option.value) === viewId) ? String(viewId) : '0';
    const view = views.find((item) => Number(item.id) === viewId);
    status.textContent = view ? `Показывается ${view.item_ids.length} выбранных позиций в заданном порядке.` : 'Сейчас показываются все позиции, проходящие остальные фильтры.';
  }

  async function applyView(view) {
    const elementId = selectedTableId();
    if (!elementId) return;
    await flushEditorSave();
    const fresh = await getScene(id);
    const table = findElement(fresh, elementId);
    if (!table || table.type !== 'table') throw new Error('Выбранный объект меню больше не найден.');
    table.table = table.table && typeof table.table === 'object' ? table.table : {};
    table.table.view_id = Number(view?.id) || 0;
    table.table.item_ids = Array.isArray(view?.item_ids) ? [...view.item_ids] : [];
    await updateSceneRemote(fresh);
    window.location.reload();
  }

  refillViews();
  sync();
  select.addEventListener('change', () => {
    const viewId = Number(select.value) || 0;
    const view = views.find((item) => Number(item.id) === viewId) || null;
    void applyView(view).catch((error) => { status.textContent = error?.message || 'Не удалось применить подборку.'; });
  });

  controls.querySelector('[data-menu-compose]').addEventListener('click', () => {
    const table = currentTable();
    if (!table) return;
    const currentView = views.find((item) => Number(item.id) === Number(table.table?.view_id)) || null;
    const modal = createComposer({
      items, classes, views, currentView,
      onSave: async (payload) => {
        const saved = currentView
          ? await api.put(`${API.catalogViews}/${currentView.id}`, payload)
          : await api.post(API.catalogViews, payload);
        views = currentView ? views.map((item) => Number(item.id) === Number(saved.id) ? saved : item) : [...views, saved];
        refillViews();
        await applyView(saved);
      }
    });
    document.body.append(modal);
  });

  const observer = new MutationObserver(sync);
  const layer = document.querySelector('#scene-elements-layer');
  if (layer) observer.observe(layer, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
  document.addEventListener('click', () => queueMicrotask(sync), true);
}
