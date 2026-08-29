import { addRow, moveRow, removeRow, updateRow } from './commands.js';
import { makeButton, price } from '../core/dom.js';
import { formatProductMetadata, formatStrength } from './renderer.js';

export function createEditorRow(kind) {
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    enabled: true,
    ...(kind === 'section'
      ? { name: 'Новый раздел' }
      : kind === 'item'
        ? { product_id: '', promotion: false, promotion_text: '' }
        : { packaging_id: '' })
  };
}

function td(className, ...children) {
  const node = document.createElement('td');
  node.className = className;
  node.append(...children.filter(Boolean));
  return node;
}

function text(value, className = '') {
  const node = document.createElement('span');
  if (className) node.className = className;
  node.textContent = value;
  return node;
}

function controlButton(label, title, tone, action) {
  const button = makeButton(label, tone, action);
  button.classList.add('editor-row-action');
  button.title = title;
  button.setAttribute('aria-label', title);
  return button;
}

function actionButtons(editorState, row, index, refresh) {
  const controls = document.createElement('div');
  controls.className = 'editor-row-actions';
  const pinnedFirstSection = index === 0 && row.kind === 'section';
  const protectedTopIndex = editorState.rows[0]?.kind === 'section' ? 1 : 0;
  const up = controlButton('↑', 'Переместить выше', '', () => { moveRow(editorState, row.id, index - 1); refresh(); });
  const down = controlButton('↓', 'Переместить ниже', '', () => { moveRow(editorState, row.id, index + 1); refresh(); });
  const visibility = controlButton(row.enabled === false ? '○' : '●', row.enabled === false ? 'Показать строку' : 'Скрыть строку', '', () => {
    updateRow(editorState, row.id, { enabled: row.enabled === false });
    refresh();
  });
  const remove = controlButton('×', 'Удалить строку', 'danger', () => { removeRow(editorState, row.id); refresh(); });

  up.disabled = pinnedFirstSection || index <= protectedTopIndex;
  down.disabled = pinnedFirstSection || index >= editorState.rows.length - 1;
  visibility.disabled = pinnedFirstSection;
  remove.disabled = pinnedFirstSection;
  if (pinnedFirstSection) {
    up.title = down.title = visibility.title = remove.title = 'Первый раздел закреплён для заголовков ценовых колонок';
  }
  controls.append(up, down, visibility, remove);
  return controls;
}

function orderCell(index, kind) {
  const wrap = document.createElement('div');
  wrap.className = 'editor-row-order';
  wrap.append(text(String(index + 1), 'editor-row-number'), text(kind, 'editor-row-kind'));
  return wrap;
}

function sectionRow(editorState, row, index, refresh, onChange) {
  const firstSection = index === 0;
  const line = document.createElement('tr');
  line.className = `editor-menu-table-section${firstSection ? ' is-pinned-section' : ''}${row.enabled === false ? ' is-disabled' : ''}`;
  line.dataset.rowId = row.id;

  const input = document.createElement('input');
  input.className = 'editor-section-name';
  input.maxLength = 100;
  input.value = row.name || '';
  input.placeholder = 'Название раздела';
  input.addEventListener('input', () => { updateRow(editorState, row.id, { name: input.value }); onChange?.(); });

  const titleCell = td('editor-menu-position editor-section-cell', input);
  titleCell.colSpan = 3;
  line.append(
    td('editor-menu-order', orderCell(index, 'Раздел')),
    titleCell,
    td('editor-menu-price editor-menu-price-label', text(firstSection ? '1 л' : '—')),
    td('editor-menu-price editor-menu-price-label', text(firstSection ? '1,5 л' : '—')),
    td('editor-menu-actions', actionButtons(editorState, row, index, refresh))
  );
  return line;
}

function productSelect(row, products, refresh, editorState) {
  const select = document.createElement('select');
  select.className = 'editor-product-select';
  select.append(
    new Option('Выберите продукцию', ''),
    ...products
      .filter((item) => item.active || Number(item.id) === Number(row.product_id))
      .map((item) => new Option(item.name, String(item.id)))
  );
  select.value = row.product_id ? String(row.product_id) : '';
  select.addEventListener('change', () => {
    updateRow(editorState, row.id, { product_id: select.value });
    refresh();
  });
  return select;
}

function databaseMetadata(product) {
  if (!product) return 'Продукция не выбрана';
  return [formatStrength(product.strength), formatProductMetadata(product)].filter(Boolean).join(' · ') || 'Характеристики не указаны';
}

function promotionEditor(editorState, row, onChange) {
  const promotion = document.createElement('div');
  promotion.className = 'editor-promotion-control';
  const toggle = document.createElement('label');
  toggle.className = 'editor-promotion-toggle';
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = row.promotion === true;
  toggle.append(check, text('Акция'));
  const promotionText = document.createElement('input');
  promotionText.maxLength = 80;
  promotionText.value = row.promotion_text || '';
  promotionText.placeholder = 'Текст';
  promotionText.disabled = !check.checked;
  check.addEventListener('change', () => {
    updateRow(editorState, row.id, { promotion: check.checked });
    promotionText.disabled = !check.checked;
    onChange?.();
  });
  promotionText.addEventListener('input', () => { updateRow(editorState, row.id, { promotion_text: promotionText.value }); onChange?.(); });
  promotion.append(toggle, promotionText);
  return promotion;
}

function itemRow(editorState, row, index, products, refresh, onChange) {
  const line = document.createElement('tr');
  line.className = `editor-menu-table-item${row.enabled === false ? ' is-disabled' : ''}`;
  line.dataset.rowId = row.id;
  const product = products.find((item) => Number(item.id) === Number(row.product_id));

  line.append(
    td('editor-menu-order', orderCell(index, 'Продукция')),
    td('editor-menu-position', productSelect(row, products, refresh, editorState)),
    td('editor-menu-producer', text(databaseMetadata(product), product ? 'editor-product-database-meta' : 'editor-muted')),
    td('editor-menu-details', promotionEditor(editorState, row, onChange)),
    td('editor-menu-price', text(product?.price_primary ? price(product.price_primary) : '—')),
    td('editor-menu-price', text(product?.price_secondary ? price(product.price_secondary) : '—')),
    td('editor-menu-actions', actionButtons(editorState, row, index, refresh))
  );
  return line;
}

function packagingRow(editorState, row, index, packaging, refresh) {
  const line = document.createElement('tr');
  line.className = `editor-menu-table-packaging${row.enabled === false ? ' is-disabled' : ''}`;
  line.dataset.rowId = row.id;
  const selected = packaging.find((item) => Number(item.id) === Number(row.packaging_id));
  const select = document.createElement('select');
  select.append(
    new Option('Выберите тару', ''),
    ...packaging
      .filter((item) => item.active || Number(item.id) === Number(row.packaging_id))
      .map((item) => new Option(item.name, String(item.id)))
  );
  select.value = row.packaging_id ? String(row.packaging_id) : '';
  select.addEventListener('change', () => {
    updateRow(editorState, row.id, { packaging_id: select.value });
    refresh();
  });

  line.append(
    td('editor-menu-order', orderCell(index, 'Тара')),
    td('editor-menu-position', select),
    td('editor-menu-producer', text('Цена за единицу тары', 'editor-muted')),
    td('editor-menu-details', text('—', 'editor-muted')),
    td('editor-menu-price', text(selected?.unit_price ? `${price(selected.unit_price)} / шт.` : '—')),
    td('editor-menu-price', text('—', 'editor-muted')),
    td('editor-menu-actions', actionButtons(editorState, row, index, refresh))
  );
  return line;
}

function buildTable(editorState, options) {
  const table = document.createElement('table');
  table.className = 'editor-menu-editor-table';
  table.innerHTML = `<colgroup><col class="col-order"><col class="col-position"><col class="col-producer"><col class="col-details"><col class="col-price"><col class="col-price"><col class="col-actions"></colgroup><thead><tr><th>№</th><th>Позиция</th><th>Данные из базы</th><th>Акция</th><th>1 л</th><th>1,5 л</th><th aria-label="Управление"></th></tr></thead>`;
  const body = document.createElement('tbody');
  const refresh = () => {
    renderRows(editorState, options);
    options.onChange?.();
  };
  editorState.rows.forEach((row, index) => {
    if (row.kind === 'section') body.append(sectionRow(editorState, row, index, refresh, options.onChange));
    else if (row.kind === 'item') body.append(itemRow(editorState, row, index, options.products, refresh, options.onChange));
    else if (row.kind === 'packaging') body.append(packagingRow(editorState, row, index, options.packaging, refresh));
  });
  table.append(body);
  return table;
}

export function renderRows(editorState, { target, empty, products, packaging, onChange }) {
  if (!target) return;
  target.replaceChildren();
  if (editorState.rows.length) {
    const scroll = document.createElement('div');
    scroll.className = 'editor-menu-table-scroll';
    scroll.append(buildTable(editorState, { target, empty, products, packaging, onChange }));
    target.append(scroll);
  }
  empty?.classList.toggle('is-hidden', editorState.rows.length !== 0);
}

export function appendRow(editorState, kind) {
  addRow(editorState, createEditorRow(kind));
}
