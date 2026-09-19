import { addRow, moveRow, removeRow, selectRow, sortSectionItems, updateRow } from './commands.js';

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

function percent(value, total) {
  return `${(Number(value || 0) / Math.max(1, Number(total || 1))) * 100}%`;
}

function button(label, title, action, tone = 'secondary') {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = `button button-${tone} editor-preview-row-action`;
  node.textContent = label;
  node.title = title;
  node.setAttribute('aria-label', title);
  node.addEventListener('click', action);
  return node;
}

function productById(products, id) {
  return products.find((item) => Number(item.id) === Number(id));
}

function packagingById(packaging, id) {
  return packaging.find((item) => Number(item.id) === Number(id));
}

function activeOptions(records, selectedId, placeholder) {
  return [
    new Option(placeholder, ''),
    ...records
      .filter((item) => item.active || Number(item.id) === Number(selectedId))
      .map((item) => new Option(item.name, String(item.id)))
  ];
}

function rowLabel(row, products, packaging) {
  if (row.kind === 'section') return row.name || 'Раздел без названия';
  if (row.kind === 'item') return productById(products, row.product_id)?.name || 'Продукция не выбрана';
  return packagingById(packaging, row.packaging_id)?.name || 'Тара не выбрана';
}

function activateRow(editorState, rowId, options) {
  selectRow(editorState, rowId);
  renderInspector(editorState, options);
}

function structuralChange(options, action) {
  options.onBeforeMutate?.();
  const result = action();
  if (result !== false) options.onStructureChange?.();
  return result;
}

function positionRowControl(node, box, model, layout) {
  node.style.left = percent(layout.horizontal.left, model.viewport.width);
  node.style.top = percent(box.top, model.viewport.height);
  node.style.width = percent(layout.horizontal.tableWidth, model.viewport.width);
  node.style.height = percent(box.height, model.viewport.height);
  node.style.setProperty('--preview-name-width', `${Math.max(42, ((layout.horizontal.primaryPriceX - layout.horizontal.left) / layout.horizontal.tableWidth) * 100 - 3)}%`);
}

function sectionInlineControl(editorState, row, options) {
  const shell = document.createElement('div');
  shell.className = 'editor-preview-inline-shell editor-preview-inline-section';

  const input = document.createElement('input');
  input.className = 'editor-preview-inline-control editor-preview-section-input';
  input.dataset.previewSectionInput = row.id;
  input.maxLength = 100;
  input.value = row.name || '';
  input.placeholder = 'Название раздела';
  input.setAttribute('aria-label', `Название раздела ${row.name || ''}`);
  input.addEventListener('focus', () => activateRow(editorState, row.id, options));
  input.addEventListener('input', () => {
    updateRow(editorState, row.id, { name: input.value });
    options.onVisualChange?.();
  });

  const sort = button('А→Я', 'Сортировать раздел по алфавиту', () => {
    activateRow(editorState, row.id, options);
    structuralChange(options, () => sortSectionItems(
      editorState,
      row.id,
      (productId) => productById(options.products, productId)?.name || ''
    ));
  });
  sort.classList.add('editor-preview-sort');
  shell.append(input, sort);
  return shell;
}

function itemInlineControl(editorState, row, options) {
  const select = document.createElement('select');
  select.className = 'editor-preview-inline-control editor-preview-product-select';
  select.dataset.previewProductSelect = row.id;
  select.setAttribute('aria-label', 'Продукция из общей базы');
  select.append(...activeOptions(options.products, row.product_id, 'Выберите продукцию'));
  select.value = row.product_id ? String(row.product_id) : '';
  select.addEventListener('focus', () => activateRow(editorState, row.id, options));
  select.addEventListener('change', () => {
    updateRow(editorState, row.id, { product_id: select.value });
    options.onVisualChange?.();
  });
  return select;
}

function packagingInlineControls(editorState, rowIds, options) {
  const shell = document.createElement('div');
  shell.className = 'editor-preview-packaging-controls';
  rowIds.forEach((rowId, index) => {
    const row = editorState.rows.find((item) => item.id === rowId);
    if (!row) return;
    const select = document.createElement('select');
    select.className = 'editor-preview-inline-control editor-preview-packaging-select';
    select.dataset.previewPackagingSelect = row.id;
    select.dataset.previewPackagingSlot = String(index + 1);
    select.setAttribute('aria-label', `Тара из общей базы, позиция ${index + 1}`);
    select.append(...activeOptions(options.packaging, row.packaging_id, 'Выберите тару'));
    select.value = row.packaging_id ? String(row.packaging_id) : '';
    select.addEventListener('focus', () => activateRow(editorState, row.id, options));
    select.addEventListener('change', () => {
      updateRow(editorState, row.id, { packaging_id: select.value });
      options.onVisualChange?.();
    });
    shell.append(select);
  });
  return shell;
}

function selectedRowActions(editorState, row, options) {
  const actions = document.createElement('div');
  actions.className = 'editor-preview-inspector-actions';
  const index = editorState.rows.findIndex((item) => item.id === row.id);
  const pinned = index === 0 && editorState.rows[0]?.kind === 'section';
  const minimum = editorState.rows[0]?.kind === 'section' ? 1 : 0;

  const up = button('↑', 'Переместить выше', () => structuralChange(options, () => moveRow(editorState, row.id, index - 1)));
  const down = button('↓', 'Переместить ниже', () => structuralChange(options, () => moveRow(editorState, row.id, index + 1)));
  const visibility = button(row.enabled === false ? 'Показать' : 'Скрыть', row.enabled === false ? 'Показать строку' : 'Скрыть строку', () => {
    structuralChange(options, () => updateRow(editorState, row.id, { enabled: row.enabled === false }));
  });
  const remove = button('Удалить', 'Удалить строку', () => structuralChange(options, () => removeRow(editorState, row.id)), 'danger');

  up.disabled = pinned || index <= minimum;
  down.disabled = pinned || index >= editorState.rows.length - 1;
  visibility.disabled = pinned;
  remove.disabled = pinned;
  actions.append(up, down, visibility, remove);

  if (row.kind === 'section') {
    const sort = button('А→Я', 'Сортировать раздел по алфавиту', () => structuralChange(options, () => sortSectionItems(
      editorState,
      row.id,
      (productId) => productById(options.products, productId)?.name || ''
    )));
    sort.classList.add('editor-preview-sort');
    actions.prepend(sort);
  }
  return actions;
}

function promotionControls(editorState, row, options) {
  if (row.kind !== 'item') return null;
  const shell = document.createElement('div');
  shell.className = 'editor-preview-promotion-editor';

  const toggle = document.createElement('label');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = row.promotion === true;
  const caption = document.createElement('span');
  caption.textContent = 'Акция';
  toggle.append(checkbox, caption);

  const text = document.createElement('input');
  text.type = 'text';
  text.maxLength = 80;
  text.value = row.promotion_text || '';
  text.placeholder = 'Текст акции';
  text.disabled = !checkbox.checked;
  text.setAttribute('aria-label', 'Текст акции');

  checkbox.addEventListener('change', () => {
    options.onBeforeMutate?.();
    updateRow(editorState, row.id, { promotion: checkbox.checked });
    text.disabled = !checkbox.checked;
    options.onVisualChange?.();
  });
  text.addEventListener('input', () => {
    updateRow(editorState, row.id, { promotion_text: text.value });
    options.onVisualChange?.();
  });
  shell.append(toggle, text);
  return shell;
}

function hiddenRowsBlock(editorState, options) {
  const hidden = editorState.rows.filter((row) => row.enabled === false);
  if (!hidden.length) return null;
  const details = document.createElement('details');
  details.className = 'editor-preview-hidden-rows';
  const summary = document.createElement('summary');
  summary.textContent = `Скрытые строки · ${hidden.length}`;
  const list = document.createElement('div');
  list.className = 'editor-preview-hidden-list';

  hidden.forEach((row) => {
    const item = document.createElement('div');
    const label = document.createElement('span');
    label.textContent = rowLabel(row, options.products, options.packaging);
    const show = button('Показать', `Показать строку ${label.textContent}`, () => {
      selectRow(editorState, row.id);
      structuralChange(options, () => updateRow(editorState, row.id, { enabled: true }));
    });
    show.classList.add('editor-preview-hidden-show');
    item.append(label, show);
    list.append(item);
  });
  details.append(summary, list);
  return details;
}

function renderInspector(editorState, options) {
  const target = options.inspector;
  if (!(target instanceof HTMLElement)) return;
  target.replaceChildren();

  const row = editorState.rows.find((item) => item.id === editorState.selectedRowId) || null;
  if (row) {
    const selected = document.createElement('div');
    selected.className = 'editor-preview-selected-row';
    const head = document.createElement('div');
    head.className = 'editor-preview-inspector-head';
    const copy = document.createElement('div');
    const eyebrow = document.createElement('span');
    eyebrow.textContent = row.kind === 'section' ? 'РАЗДЕЛ' : row.kind === 'item' ? 'ПРОДУКЦИЯ' : 'ТАРА';
    const title = document.createElement('strong');
    title.textContent = rowLabel(row, options.products, options.packaging);
    copy.append(eyebrow, title);
    head.append(copy, selectedRowActions(editorState, row, options));
    selected.append(head);
    const promotion = promotionControls(editorState, row, options);
    if (promotion) selected.append(promotion);
    target.append(selected);
  } else {
    const help = document.createElement('p');
    help.className = 'editor-preview-inspector-help';
    help.textContent = 'Выберите поле прямо в Preview. Названия разделов и позиции редактируются на месте.';
    target.append(help);
  }

  const hidden = hiddenRowsBlock(editorState, options);
  if (hidden) target.append(hidden);
}

export function renderPreviewRows(editorState, {
  target,
  inspector,
  model,
  lines,
  layout,
  products = [],
  packaging = [],
  onBeforeMutate,
  onVisualChange,
  onStructureChange
}) {
  if (!(target instanceof HTMLElement) || !model || !layout || !Array.isArray(lines)) return;
  const options = { inspector, products, packaging, onBeforeMutate, onVisualChange, onStructureChange };
  target.replaceChildren();

  lines.forEach((line, index) => {
    const box = layout.vertical.boxes[index];
    if (!box) return;
    const sourceIds = line.kind === 'packaging'
      ? (Array.isArray(line.sourceRowIds) ? line.sourceRowIds.filter(Boolean) : [])
      : (line.sourceRowId ? [line.sourceRowId] : []);
    if (!sourceIds.length) return;

    const control = document.createElement('div');
    control.className = `editor-preview-row-control editor-preview-row-${line.kind}`;
    control.dataset.editorPreviewRowControl = line.kind;
    control.dataset.sourceRowIds = sourceIds.join(',');
    positionRowControl(control, box, model, layout);

    if (line.kind === 'section') {
      const row = editorState.rows.find((item) => item.id === line.sourceRowId);
      if (row) control.append(sectionInlineControl(editorState, row, options));
    } else if (line.kind === 'item') {
      const row = editorState.rows.find((item) => item.id === line.sourceRowId);
      if (row) control.append(itemInlineControl(editorState, row, options));
    } else {
      control.append(packagingInlineControls(editorState, sourceIds, options));
    }
    target.append(control);
  });

  renderInspector(editorState, options);
}

export function appendRow(editorState, kind) {
  addRow(editorState, createEditorRow(kind));
}
