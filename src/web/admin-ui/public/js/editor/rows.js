import { addRow, moveRow, removeRow, selectRow, sortSectionItems, updateRow } from './commands.js';

let openChoice = null;

export function createEditorRow(kind) {
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    enabled: true,
    ...(kind === 'section'
      ? { name: 'Новый раздел' }
      : kind === 'item'
        ? { product_id: '', promotion: false, promotion_text: '', promotion_animation: 'wave', promotion_badge_animation: 'shine' }
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

function activeRecords(records, selectedId) {
  return records
    .filter((item) => item.active || Number(item.id) === Number(selectedId))
    .slice()
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'ru', { sensitivity:'base' }));
}

function choiceControl({
  records,
  selectedId,
  placeholder,
  ariaLabel,
  datasetName,
  className,
  optionMeta,
  onOpen,
  onChange
}) {
  const shell = document.createElement('div');
  shell.className = `editor-preview-choice ${className}`;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'editor-preview-inline-control editor-preview-choice-trigger';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', ariaLabel);
  trigger.dataset[datasetName] = String(selectedId || '');

  const selected = records.find((item) => Number(item.id) === Number(selectedId));
  const triggerText = document.createElement('span');
  triggerText.className = 'editor-preview-choice-trigger-text';
  triggerText.textContent = selected?.name || placeholder;
  trigger.append(triggerText);

  const popup = document.createElement('div');
  popup.className = 'editor-preview-choice-popup';
  popup.hidden = true;

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'editor-preview-choice-search';
  search.placeholder = 'Поиск…';
  search.autocomplete = 'off';
  search.setAttribute('aria-label', `Поиск: ${ariaLabel}`);

  const list = document.createElement('div');
  list.className = 'editor-preview-choice-list';
  list.setAttribute('role', 'listbox');
  const listId = `choice-${Math.random().toString(36).slice(2, 10)}`;
  list.id = listId;
  trigger.setAttribute('aria-controls', listId);

  const empty = document.createElement('div');
  empty.className = 'editor-preview-choice-empty';
  empty.textContent = 'Ничего не найдено';
  empty.hidden = true;

  const source = activeRecords(records, selectedId);
  const render = (query = '') => {
    const needle = query.trim().toLocaleLowerCase('ru');
    list.replaceChildren();
    const matches = source.filter((item) => {
      if (!needle) return true;
      const haystack = [item.name, item.producer, item.strength, item.characteristics]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('ru');
      return haystack.includes(needle);
    });
    empty.hidden = matches.length > 0;
    for (const item of matches) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'editor-preview-choice-option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', Number(item.id) === Number(selectedId) ? 'true' : 'false');
      option.dataset.value = String(item.id);

      const title = document.createElement('strong');
      title.textContent = item.name || 'Без названия';
      option.append(title);

      const metaText = optionMeta?.(item) || '';
      if (metaText) {
        const meta = document.createElement('small');
        meta.textContent = metaText;
        option.append(meta);
      }

      option.addEventListener('click', () => {
        selectedId = String(item.id);
        trigger.dataset[datasetName] = selectedId;
        triggerText.textContent = item.name || placeholder;
        close();
        onChange?.(selectedId);
      });
      list.append(option);
    }
  };

  const onDocumentPointerDown = (event) => {
    if (!shell.contains(event.target)) close();
  };

  const close = () => {
    if (popup.hidden) return;
    popup.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    if (openChoice?.close === close) openChoice = null;
  };

  const open = () => {
    if (!popup.hidden) return;
    openChoice?.close?.();
    openChoice = { close };
    onOpen?.();
    const editorScroll = shell.closest('.scene-table-editor-scroll');
    if (editorScroll instanceof HTMLElement) {
      const shellRect = shell.getBoundingClientRect();
      const scrollRect = editorScroll.getBoundingClientRect();
      const offset = (shellRect.top + shellRect.height / 2) - (scrollRect.top + scrollRect.height / 2);
      editorScroll.scrollTop += offset;
    }
    search.value = '';
    render();
    popup.hidden = false;
    popup.classList.remove('is-above');
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    requestAnimationFrame(() => {
      const boundary = shell.closest('.scene-editor-stage-shell, .editor-menu-preview')?.getBoundingClientRect();
      const popupRect = popup.getBoundingClientRect();
      if (boundary && popupRect.bottom > boundary.bottom - 4 && popupRect.top - boundary.top > popupRect.height + 4) {
        popup.classList.add('is-above');
      }
      search.focus();
    });
  };

  trigger.addEventListener('click', () => popup.hidden ? open() : close());
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      open();
    }
    if (event.key === 'Escape') close();
  });
  search.addEventListener('input', () => render(search.value));
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      trigger.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      list.querySelector('[role="option"]')?.focus();
    }
  });

  popup.append(search, list, empty);
  shell.append(trigger, popup);
  render();
  return shell;
}

function rowLabel(row, products, packaging) {
  if (row.kind === 'section') return row.name || 'Раздел без названия';
  if (row.kind === 'item') return productById(products, row.product_id)?.name || 'Продукция не выбрана';
  return packagingById(packaging, row.packaging_id)?.name || 'Тара не выбрана';
}

function activateRow(editorState, rowId, options) {
  selectRow(editorState, rowId);
  options.editorTarget?.querySelectorAll('.scene-table-editor-row').forEach((node) => {
    const ids = String(node.dataset.sourceRowIds || '').split(',').filter(Boolean);
    node.classList.toggle('is-selected', ids.includes(String(rowId)));
  });
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
  return choiceControl({
    records:options.products,
    selectedId:row.product_id,
    placeholder:'Выберите продукцию',
    ariaLabel:'Продукция из общей базы',
    datasetName:'previewProductSelect',
    className:'editor-preview-product-choice',
    optionMeta:(item) => [item.producer, item.strength].filter(Boolean).join(' · '),
    onOpen:() => activateRow(editorState, row.id, options),
    onChange:(value) => {
      updateRow(editorState, row.id, { product_id:value });
      options.onVisualChange?.();
    }
  });
}

function packagingInlineControls(editorState, rowIds, options) {
  const shell = document.createElement('div');
  shell.className = 'editor-preview-packaging-controls';
  rowIds.forEach((rowId, index) => {
    const row = editorState.rows.find((item) => item.id === rowId);
    if (!row) return;
    const choice = choiceControl({
      records:options.packaging,
      selectedId:row.packaging_id,
      placeholder:'Выберите тару',
      ariaLabel:`Тара из общей базы, позиция ${index + 1}`,
      datasetName:'previewPackagingSelect',
      className:'editor-preview-packaging-choice',
      onOpen:() => activateRow(editorState, row.id, options),
      onChange:(value) => {
        updateRow(editorState, row.id, { packaging_id:value });
        options.onVisualChange?.();
      }
    });
    choice.dataset.previewPackagingSlot = String(index + 1);
    shell.append(choice);
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

export const PROMOTION_ROW_ANIMATION_OPTIONS = Object.freeze([
  Object.freeze(['wave', 'Мягкая волна']),
  Object.freeze(['fill', 'Заполнение']),
  Object.freeze(['gloss', 'Gloss-перелив'])
]);

export const PROMOTION_BADGE_ANIMATION_OPTIONS = Object.freeze([
  Object.freeze(['shine', 'Gloss Shine']),
  Object.freeze(['breathe', 'Breathing Glow'])
]);

function promotionPresetControl({ labelText, ariaLabel, value, choices, disabled = false, onChange }) {
  const field = document.createElement('div');
  field.className = 'editor-preview-promotion-preset-field';

  const caption = document.createElement('span');
  caption.textContent = labelText;

  const group = document.createElement('div');
  group.className = 'editor-preview-promotion-preset-group';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', ariaLabel);

  let current = value;
  const buttons = choices.map(([nextValue, text]) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'editor-preview-promotion-preset';
    option.textContent = text;
    option.dataset.value = nextValue;
    option.setAttribute('role', 'radio');
    option.addEventListener('click', () => {
      if (option.disabled || current === nextValue) return;
      current = nextValue;
      sync();
      onChange?.(nextValue);
    });
    group.append(option);
    return option;
  });

  const sync = () => {
    buttons.forEach((option) => {
      const checked = option.dataset.value === current;
      option.classList.toggle('is-selected', checked);
      option.setAttribute('aria-checked', String(checked));
    });
  };
  const setDisabled = (nextDisabled) => {
    buttons.forEach((option) => { option.disabled = nextDisabled === true; });
  };
  sync();
  setDisabled(disabled);
  field.append(caption, group);
  return { field, setDisabled };
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
    const promotionText = checkbox.checked && !text.value.trim() ? 'АКЦИЯ' : text.value;
    if (promotionText !== text.value) text.value = promotionText;
    updateRow(editorState, row.id, {
      promotion: checkbox.checked,
      promotion_text: promotionText
    });
    text.disabled = !checkbox.checked;
    options.onVisualChange?.();
  });
  text.addEventListener('input', () => {
    updateRow(editorState, row.id, { promotion_text: text.value });
    options.onVisualChange?.();
  });

  const animationGrid = document.createElement('div');
  animationGrid.className = 'editor-preview-promotion-motion-grid';

  const rowAnimation = promotionPresetControl({
    labelText:'Эффект строки',
    ariaLabel:'Эффект строки',
    value:row.promotion_animation || 'wave',
    disabled:!checkbox.checked,
    choices:PROMOTION_ROW_ANIMATION_OPTIONS,
    onChange:(value) => {
      options.onBeforeMutate?.();
      updateRow(editorState, row.id, { promotion_animation:value });
      options.onVisualChange?.();
    }
  });

  const badgeAnimation = promotionPresetControl({
    labelText:'Эффект плашки',
    ariaLabel:'Эффект плашки',
    value:row.promotion_badge_animation || 'shine',
    disabled:!checkbox.checked,
    choices:PROMOTION_BADGE_ANIMATION_OPTIONS,
    onChange:(value) => {
      options.onBeforeMutate?.();
      updateRow(editorState, row.id, { promotion_badge_animation:value });
      options.onVisualChange?.();
    }
  });

  checkbox.addEventListener('change', () => {
    rowAnimation.setDisabled(!checkbox.checked);
    badgeAnimation.setDisabled(!checkbox.checked);
  });

  animationGrid.append(rowAnimation.field, badgeAnimation.field);
  shell.append(toggle, text, animationGrid);
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

function tableEditorFrame(model) {
  const x = Math.max(0, Number(model?.settings?.table_x) || 0);
  const y = Math.max(0, Number(model?.settings?.table_y) || 0);
  const width = Math.max(1, Number(model?.settings?.table_width_px) || model?.viewport?.width || 1);
  const height = Math.max(1, Number(model?.settings?.table_height_px) || model?.viewport?.height || 1);
  return { x, y, width, height };
}

function tableEditorGroups(editorState) {
  const visible = editorState.rows.filter((row) => row?.enabled !== false);
  const groups = [];
  for (let index = 0; index < visible.length; index += 1) {
    const row = visible[index];
    if (row.kind !== 'packaging') {
      groups.push({ kind:row.kind, rows:[row] });
      continue;
    }
    const next = visible[index + 1];
    if (next?.kind === 'packaging') {
      groups.push({ kind:'packaging', rows:[row, next] });
      index += 1;
    } else {
      groups.push({ kind:'packaging', rows:[row] });
    }
  }
  return groups;
}

function tableEditorKindLabel(kind, count = 1) {
  if (kind === 'section') return 'РАЗДЕЛ';
  if (kind === 'item') return 'ПРОДУКЦИЯ';
  return count > 1 ? 'ТАРА · 2 ПОЗИЦИИ' : 'ТАРА';
}

function tableEditorControl(editorState, group, options) {
  if (group.kind === 'section') return sectionInlineControl(editorState, group.rows[0], options);
  if (group.kind === 'item') return itemInlineControl(editorState, group.rows[0], options);
  return packagingInlineControls(editorState, group.rows.map((row) => row.id), options);
}

export function renderTableEditorRows(editorState, {
  target,
  inspector,
  model,
  products = [],
  packaging = [],
  onBeforeMutate,
  onVisualChange,
  onStructureChange
}) {
  if (!(target instanceof HTMLElement) || !model) return;
  const options = {
    inspector,
    products,
    packaging,
    onBeforeMutate,
    onVisualChange,
    onStructureChange,
    editorTarget:target
  };
  target.replaceChildren();

  const panel = document.createElement('section');
  panel.className = 'scene-table-editor-panel';
  panel.setAttribute('aria-label', 'Редактор таблицы меню');
  const frame = tableEditorFrame(model);
  panel.style.left = percent(frame.x, model.viewport.width);
  panel.style.top = percent(frame.y, model.viewport.height);
  panel.style.width = percent(frame.width, model.viewport.width);
  panel.style.height = percent(frame.height, model.viewport.height);

  const head = document.createElement('header');
  head.className = 'scene-table-editor-head';
  const headCopy = document.createElement('div');
  const eyebrow = document.createElement('span');
  eyebrow.textContent = 'РЕДАКТИРОВАНИЕ ТАБЛИЦЫ';
  const title = document.createElement('strong');
  title.textContent = 'Содержимое меню';
  headCopy.append(eyebrow, title);
  const counter = document.createElement('span');
  const visibleCount = editorState.rows.filter((row) => row?.enabled !== false).length;
  counter.className = 'scene-table-editor-count';
  counter.textContent = `${visibleCount} строк`;
  head.append(headCopy, counter);

  const scroll = document.createElement('div');
  scroll.className = 'scene-table-editor-scroll';

  const groups = tableEditorGroups(editorState);
  if (!groups.length) {
    const empty = document.createElement('p');
    empty.className = 'scene-table-editor-empty';
    empty.textContent = 'Таблица пуста. Добавьте раздел, продукцию или тару справа.';
    scroll.append(empty);
  }

  for (const group of groups) {
    const rowNode = document.createElement('div');
    rowNode.className = `scene-table-editor-row is-${group.kind}`;
    rowNode.dataset.sourceRowIds = group.rows.map((row) => row.id).join(',');
    rowNode.classList.toggle('is-selected', group.rows.some((row) => row.id === editorState.selectedRowId));

    const type = document.createElement('span');
    type.className = 'scene-table-editor-kind';
    type.textContent = tableEditorKindLabel(group.kind, group.rows.length);

    const control = document.createElement('div');
    control.className = 'scene-table-editor-control';
    control.append(tableEditorControl(editorState, group, options));

    rowNode.addEventListener('pointerdown', (event) => {
      if (event.target instanceof Element && event.target.closest('button,input,select,textarea')) return;
      activateRow(editorState, group.rows[0].id, options);
    });
    rowNode.append(type, control);
    scroll.append(rowNode);
  }

  panel.append(head, scroll);
  target.append(panel);
  renderInspector(editorState, options);
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
