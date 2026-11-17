import { markEditorChanged } from './state.js';

function rowIndex(state, rowId) {
  return state.rows.findIndex((row) => row.id === rowId);
}

function hasPinnedFirstSection(state) {
  return state.rows[0]?.kind === 'section';
}

export function addRow(state, row, { index = state.rows.length } = {}) {
  if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id) throw new TypeError('Строка редактора должна иметь непустой id.');
  if (state.rows.some((item) => item.id === row.id)) throw new Error(`Строка с id ${row.id} уже существует.`);
  const minimum = hasPinnedFirstSection(state) ? 1 : 0;
  const target = Math.max(minimum, Math.min(Number.isInteger(index) ? index : state.rows.length, state.rows.length));
  state.rows.splice(target, 0, structuredClone(row));
  state.selectedRowId = row.id;
  return markEditorChanged(state);
}

export function removeRow(state, rowId) {
  const index = rowIndex(state, rowId);
  if (index === -1) return false;
  if (index === 0 && hasPinnedFirstSection(state)) return false;
  state.rows.splice(index, 1);
  if (state.selectedRowId === rowId) state.selectedRowId = null;
  markEditorChanged(state);
  return true;
}

export function moveRow(state, rowId, toIndex) {
  const fromIndex = rowIndex(state, rowId);
  if (fromIndex === -1) return false;
  const pinned = hasPinnedFirstSection(state);
  if (pinned && fromIndex === 0) return false;
  const minimum = pinned ? 1 : 0;
  const target = Math.max(minimum, Math.min(Number.isInteger(toIndex) ? toIndex : fromIndex, state.rows.length - 1));
  if (fromIndex === target) return true;
  const [row] = state.rows.splice(fromIndex, 1);
  state.rows.splice(target, 0, row);
  markEditorChanged(state);
  return true;
}

export function changeRowColumn(state, rowId, column) {
  const index = rowIndex(state, rowId);
  if (index === -1 || !['left', 'right', 'full'].includes(column)) return false;
  const row = state.rows[index];
  if (row.kind !== 'section' && column === 'full') return false;
  const current = row.column === 'full' && row.kind === 'section' ? 'full'
    : row.column === 'right' ? 'right' : 'left';
  if (current === column) return true;
  // Column is a presentation property: changing it never reparents the row.
  return updateRow(state, rowId, { column });
}

export function sortSectionItems(state, sectionId, productNameById) {
  const sectionIndex = rowIndex(state, sectionId);
  if (sectionIndex === -1 || state.rows[sectionIndex]?.kind !== 'section') return false;
  if (typeof productNameById !== 'function') throw new TypeError('Для сортировки раздела требуется функция получения названия продукции.');

  // Logical sections are contiguous in the stored menu, regardless of visual column.
  let end = sectionIndex + 1;
  while (end < state.rows.length && state.rows[end]?.kind !== 'section') end += 1;

  const items = [];
  for (let index = sectionIndex + 1; index < end; index += 1) {
    const row = state.rows[index];
    if (row?.kind !== 'item') continue;
    items.push({ index, row, name:String(productNameById(row.product_id) || '') });
  }
  if (items.length < 2) return true;

  const readable = state.settings?.table_style === 'readable';
  // In two-column display the reading order is left top-to-bottom, then right.
  // Keep the number of positions in each column while also sorting the linear
  // stored list. Products may change columns within the same logical section.
  const slots = readable
    ? [...items].sort((a, b) => Number(a.row.column === 'right') - Number(b.row.column === 'right') || a.index - b.index)
    : items;
  const collator = new Intl.Collator('ru', { usage:'sort', sensitivity:'base' });
  const sorted = slots.map((entry, order) => ({ ...entry, order }))
    .sort((a, b) => collator.compare(a.name, b.name) || a.order - b.order);
  const leftCount = readable ? items.filter((entry) => entry.row.column !== 'right').length : items.length;
  // The stored order must also be alphabetical: switching to the classic layout
  // cannot reveal an unsorted logical list hidden by the two-column projection.
  const nextItems = sorted.map(({ row }, index) => readable
    ? { ...row, column:index < leftCount ? 'left' : 'right' }
    : row);
  const changed = items.some(({ row }, index) =>
    row.id !== nextItems[index].id ||
    (readable && (row.column === 'right' ? 'right' : 'left') !== nextItems[index].column));
  if (!changed) return true;

  items.forEach(({ index }, position) => {
    state.rows[index] = nextItems[position];
  });
  markEditorChanged(state);
  return true;
}

export function updateRow(state, rowId, patch) {
  const index = rowIndex(state, rowId);
  if (index === -1) return false;
  const pinned = index === 0 && hasPinnedFirstSection(state);
  state.rows[index] = {
    ...state.rows[index],
    ...structuredClone(patch),
    id: state.rows[index].id,
    ...(pinned ? { kind: 'section', enabled: true } : {})
  };
  markEditorChanged(state);
  return true;
}

export function selectRow(state, rowId) {
  state.selectedRowId = rowId === null || state.rows.some((row) => row.id === rowId) ? rowId : null;
  return state;
}

export function updateSettings(state, patch) {
  state.settings = { ...state.settings, ...structuredClone(patch || {}) };
  return markEditorChanged(state);
}

export function updateScreen(state, patch) {
  state.screen = { ...(state.screen || {}), ...structuredClone(patch || {}) };
  return markEditorChanged(state);
}


function sceneElementIndex(state, elementId) {
  return Array.isArray(state.scene?.elements) ? state.scene.elements.findIndex((element) => element.id === elementId) : -1;
}

export function addSceneElement(state, element) {
  if (!element || typeof element !== 'object' || typeof element.id !== 'string' || !element.id) throw new TypeError('Элемент сцены должен иметь непустой id.');
  if (!state.scene || typeof state.scene !== 'object') state.scene = { version: 1, elements: [] };
  if (!Array.isArray(state.scene.elements)) state.scene.elements = [];
  if (state.scene.elements.some((item) => item.id === element.id)) throw new Error(`Элемент с id ${element.id} уже существует.`);
  state.scene.elements.push(structuredClone(element));
  state.selectedElementId = element.id;
  return markEditorChanged(state);
}

export function updateSceneElement(state, elementId, patch) {
  const index = sceneElementIndex(state, elementId);
  if (index === -1) return false;
  state.scene.elements[index] = { ...state.scene.elements[index], ...structuredClone(patch || {}), id: state.scene.elements[index].id };
  markEditorChanged(state);
  return true;
}

export function replaceSceneElement(state, elementId, nextElement) {
  const index = sceneElementIndex(state, elementId);
  if (index === -1) return false;
  state.scene.elements[index] = { ...structuredClone(nextElement), id: state.scene.elements[index].id };
  markEditorChanged(state);
  return true;
}

export function removeSceneElement(state, elementId) {
  const index = sceneElementIndex(state, elementId);
  if (index === -1) return false;
  state.scene.elements.splice(index, 1);
  if (state.selectedElementId === elementId) state.selectedElementId = state.scene.elements[index]?.id || state.scene.elements[index - 1]?.id || null;
  markEditorChanged(state);
  return true;
}

export function selectSceneElement(state, elementId) {
  state.selectedElementId = elementId === null || sceneElementIndex(state, elementId) !== -1 ? elementId : null;
  return state;
}
