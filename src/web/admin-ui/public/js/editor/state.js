function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export const DEFAULT_FIRST_SECTION_NAME = 'Новый раздел';

function firstSectionId(screen) {
  const screenId = Number(screen?.id);
  return Number.isSafeInteger(screenId) && screenId > 0 ? `section-primary-${screenId}` : 'section-primary';
}

export function ensureLeadingSectionRows(rows, screen = null) {
  const source = clone(Array.isArray(rows) ? rows : []);
  if (source[0]?.kind === 'section') {
    const changed = source[0].enabled === false;
    source[0] = { ...source[0], enabled: true };
    return { rows: source, changed };
  }
  return {
    rows: [{ id: firstSectionId(screen), kind: 'section', name: DEFAULT_FIRST_SECTION_NAME, enabled: true }, ...source],
    changed: true
  };
}

export function createEditorState(initial = {}) {
  const rowsProvided = Array.isArray(initial.rows);
  const normalizedRows = rowsProvided
    ? ensureLeadingSectionRows(initial.rows, initial.screen ?? null)
    : { rows: [], changed: false };
  return {
    screen: clone(initial.screen ?? null),
    rows: normalizedRows.rows,
    settings: clone(initial.settings && typeof initial.settings === 'object' ? initial.settings : {}),
    selectedRowId: initial.selectedRowId ?? null,
    dirty: initial.dirty === true || normalizedRows.changed,
    revision: Number.isInteger(initial.revision) ? initial.revision : 0,
    draftRevision: Number.isInteger(initial.draftRevision) ? initial.draftRevision : 0
  };
}

export function snapshotEditorState(state) {
  return clone(state);
}

export function replaceEditorState(target, next) {
  const normalized = createEditorState(next);
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, normalized);
  return target;
}

export function markEditorChanged(state) {
  state.dirty = true;
  state.revision += 1;
  return state;
}

export function markEditorSaved(state) {
  state.dirty = false;
  return state;
}
