import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, setMessage, clearMessage, setPending } from '../core/dom.js';
import { decodeCsvFile } from './csv-decoder.js';

const IMPORT_STATUS_LABELS = Object.freeze({ new: 'Новая', changed: 'Изменена', unchanged: 'Без изменений', error: 'Ошибка', excluded: 'Исключена' });
const IMPORT_FIELDS = Object.freeze(['id', 'name', 'producer', 'characteristics', 'strength', 'price_primary', 'alcoholic', 'beverage_color', 'filtration', 'active']);
let importPreview = null;
let importValidationTimer = null;
let importEditRevision = 0;
let importValidationSequence = 0;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function importDisplayValue(field, value) {
  if (field === 'alcoholic' || field === 'active') return value === true ? 'да' : value === false ? 'нет' : String(value ?? '');
  if (field === 'beverage_color') return ({ none: 'не указан', light: 'светлый', dark: 'тёмный', white: 'белое', semi_dark: 'полутёмное', amber: 'янтарное', red: 'красное' })[value] || String(value ?? '');
  if (field === 'filtration') return ({ none: 'не указана', filtered: 'фильтрованное', unfiltered: 'нефильтрованное' })[value] || String(value ?? '');
  return String(value ?? '');
}

function importError(row, field) {
  return row.errors?.find((item) => item.field === field) || null;
}

function importChange(row, field) {
  return row.changes?.find((item) => item.field === field) || null;
}

function importHintMarkup(row, field) {
  const error = importError(row, field);
  if (error) return `<small class="catalog-import-error">${escapeHtml(error.message)}</small>`;
  const change = importChange(row, field);
  if (!change) return '';
  return `<small class="catalog-import-change">${escapeHtml(importDisplayValue(field, change.before))} → ${escapeHtml(importDisplayValue(field, change.after))}</small>`;
}

function importTextCell(row, field, { max = 180, inputmode = '' } = {}) {
  const error = importError(row, field);
  const value = row.values?.[field] ?? '';
  return `<td class="catalog-import-edit-cell${error ? ' has-error' : ''}"><input data-import-field="${field}" aria-label="${escapeHtml(field)}" value="${escapeHtml(value)}" maxlength="${max}"${inputmode ? ` inputmode="${inputmode}"` : ''} ${row.excluded ? 'disabled' : ''}/>${importHintMarkup(row, field)}</td>`;
}

function selectOptions(current, options) {
  const source = String(current ?? '');
  const known = options.some(([value]) => String(value) === source);
  const all = known || source === '' ? options : [[source, `${source} — исправьте`], ...options];
  return all.map(([value, label]) => `<option value="${escapeHtml(value)}"${String(value) === source ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');
}

function importSelectCell(row, field, options) {
  const error = importError(row, field);
  const value = row.values?.[field];
  return `<td class="catalog-import-edit-cell${error ? ' has-error' : ''}"><select data-import-field="${field}" aria-label="${escapeHtml(field)}" ${row.excluded ? 'disabled' : ''}>${selectOptions(value, options)}</select>${importHintMarkup(row, field)}</td>`;
}

function importStatusMarkup(row) {
  const rowError = row.errors?.find((item) => item.field === '_row');
  return `<td class="catalog-import-status-cell"><span class="catalog-import-status is-${row.status}">${escapeHtml(IMPORT_STATUS_LABELS[row.status] || row.status)}</span><small>Строка ${row.line}</small>${rowError ? `<small class="catalog-import-error">${escapeHtml(rowError.message)}</small>` : ''}</td>`;
}

function importRowMarkup(row) {
  const secondary = row.normalized?.price_secondary || '—';
  return `<tr data-import-key="${escapeHtml(row.key)}" class="is-${row.status}${row.excluded ? ' is-excluded' : ''}">
    ${importStatusMarkup(row)}
    ${importTextCell(row, 'id', { max: 20, inputmode: 'numeric' })}
    ${importTextCell(row, 'name', { max: 120 })}
    ${importTextCell(row, 'producer', { max: 120 })}
    ${importTextCell(row, 'characteristics', { max: 180 })}
    ${importTextCell(row, 'strength', { max: 20 })}
    ${importTextCell(row, 'price_primary', { max: 16, inputmode: 'decimal' })}
    <td class="catalog-import-calculated" aria-label="Цена 1,5 л, расчётная">${escapeHtml(secondary)} <small>расчётная</small></td>
    ${importSelectCell(row, 'alcoholic', [['false', 'нет'], ['true', 'да']])}
    ${importSelectCell(row, 'beverage_color', [['none', 'не указан'], ['light', 'светлый'], ['dark', 'тёмный'], ['white', 'белое'], ['semi_dark', 'полутёмное'], ['amber', 'янтарное'], ['red', 'красное']])}
    ${importSelectCell(row, 'filtration', [['none', 'не указана'], ['filtered', 'фильтрованное'], ['unfiltered', 'нефильтрованное']])}
    ${importSelectCell(row, 'active', [['true', 'да'], ['false', 'нет']])}
    <td class="catalog-import-exclude"><label><input type="checkbox" data-import-excluded aria-label="Исключить строку ${row.line} из импорта" ${row.excluded ? 'checked' : ''}/><span>${row.excluded ? 'Не импортировать' : 'Импортировать'}</span></label></td>
  </tr>`;
}

function focusSnapshot() {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement || active instanceof HTMLSelectElement)) return null;
  const row = active.closest('[data-import-key]');
  const field = active.dataset.importField;
  if (!row || !field) return null;
  return {
    key: row.dataset.importKey,
    field,
    start: active instanceof HTMLInputElement ? active.selectionStart : null,
    end: active instanceof HTMLInputElement ? active.selectionEnd : null
  };
}

function restoreFocus(snapshot) {
  if (!snapshot) return;
  const row = [...document.querySelectorAll('[data-import-key]')].find((item) => item.dataset.importKey === snapshot.key);
  const control = row?.querySelector(`[data-import-field="${snapshot.field}"]`);
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return;
  control.focus({ preventScroll: true });
  if (control instanceof HTMLInputElement && snapshot.start !== null) control.setSelectionRange(snapshot.start, snapshot.end ?? snapshot.start);
}

function renderImportPreview(snapshot = null) {
  const section = element('product-import-preview');
  const body = element('product-import-body');
  if (!section || !body || !importPreview) return;
  section.classList.remove('is-hidden');
  body.innerHTML = importPreview.rows.map(importRowMarkup).join('');
  for (const [name, value] of Object.entries(importPreview.summary || {})) {
    const target = document.querySelector(`[data-import-count="${name}"]`);
    if (target) target.textContent = String(value);
  }
  const apply = element('product-import-apply');
  if (apply instanceof HTMLButtonElement) apply.disabled = !importPreview.canApply;
  const hint = element('product-import-hint');
  if (hint) {
    if (importPreview.summary?.error) hint.textContent = 'Исправьте ошибки или исключите проблемные строки.';
    else if (!(importPreview.summary?.new || importPreview.summary?.changed)) hint.textContent = 'Изменений для применения нет.';
    else hint.textContent = 'Все строки проверены. Можно применить изменения.';
  }
  restoreFocus(snapshot);
}

function controlValue(row, field) {
  const control = row?.querySelector(`[data-import-field="${field}"]`);
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return '';
  if ((field === 'alcoholic' || field === 'active') && (control.value === 'true' || control.value === 'false')) return control.value === 'true';
  return control.value;
}

function snapshotImportRows() {
  if (!importPreview) return [];
  const domRows = [...document.querySelectorAll('#product-import-body [data-import-key]')];
  return importPreview.rows.map((source) => {
    const row = domRows.find((item) => item.dataset.importKey === source.key);
    const excluded = row?.querySelector('[data-import-excluded]');
    return {
      key: source.key,
      line: source.line,
      excluded: excluded instanceof HTMLInputElement ? excluded.checked : source.excluded === true,
      values: Object.fromEntries(IMPORT_FIELDS.map((field) => [field, row ? controlValue(row, field) : source.values?.[field] ?? '']))
    };
  });
}

async function validateImportRows(revision) {
  const rows = snapshotImportRows();
  const snapshot = focusSnapshot();
  const sequence = ++importValidationSequence;
  try {
    const result = await api.post(API.productsImportPreview, { rows });
    if (revision !== importEditRevision || sequence !== importValidationSequence) return;
    importPreview = result;
    clearMessage('product-import-message');
    renderImportPreview(snapshot);
  } catch (error) {
    if (revision === importEditRevision) setMessage('product-import-message', error.message);
  }
}

function scheduleImportValidation(delay = 320) {
  importEditRevision += 1;
  clearTimeout(importValidationTimer);
  const revision = importEditRevision;
  const apply = element('product-import-apply');
  if (apply instanceof HTMLButtonElement) apply.disabled = true;
  const hint = element('product-import-hint');
  if (hint) hint.textContent = 'Проверяем изменения…';
  importValidationTimer = setTimeout(() => { void validateImportRows(revision); }, delay);
}

function closeImportPreview() {
  clearTimeout(importValidationTimer);
  importPreview = null;
  importEditRevision += 1;
  importValidationSequence += 1;
  element('product-import-preview')?.classList.add('is-hidden');
  const body = element('product-import-body');
  if (body) body.replaceChildren();
  clearMessage('product-import-message');
  const input = element('product-import-file');
  if (input instanceof HTMLInputElement) input.value = '';
}

async function previewProductsFile(file) {
  const button = element('product-import');
  const input = element('product-import-file');
  setPending(button, true, 'Читаем файл…');
  clearMessage('product-message');
  try {
    const csv = await decodeCsvFile(file);
    importPreview = await api.post(API.productsImportPreview, { csv });
    importEditRevision += 1;
    renderImportPreview();
    element('product-import-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    closeImportPreview();
    setMessage('product-message', error.message);
  } finally {
    if (input instanceof HTMLInputElement) input.value = '';
    setPending(button, false, 'Читаем файл…');
  }
}

async function applyImportProducts(onApplied) {
  if (!importPreview) return;
  const button = element('product-import-apply');
  setPending(button, true, 'Применяем…');
  clearMessage('product-import-message');
  try {
    const rows = snapshotImportRows();
    const checked = await api.post(API.productsImportPreview, { rows });
    importPreview = checked;
    if (!checked.canApply) {
      renderImportPreview();
      setMessage('product-import-message', checked.summary?.error ? 'Исправьте ошибки перед применением.' : 'В файле нет изменений для базы.');
      return;
    }
    const result = await api.post(API.productsImport, { rows });
    closeImportPreview();
    await onApplied?.(result);
    setMessage('product-message', `Импорт применён: создано ${result.created}, обновлено ${result.updated}, без изменений ${result.unchanged || 0}.`, 'success');
  } catch (error) {
    setMessage('product-import-message', error.message);
    try {
      importPreview = await api.post(API.productsImportPreview, { rows: snapshotImportRows() });
      renderImportPreview();
    } catch { /* keep the original apply error visible */ }
  } finally {
    setPending(button, false, 'Применяем…');
    if (button instanceof HTMLButtonElement && importPreview) button.disabled = !importPreview.canApply;
  }
}

export function initialiseProductImport({ onApplied } = {}) {
  element('product-import')?.addEventListener('click', () => { element('product-import-file')?.click(); });
  element('product-import-file')?.addEventListener('change', (event) => {
    const file = event.target?.files?.[0];
    if (file) void previewProductsFile(file);
  });
  element('product-import-cancel')?.addEventListener('click', closeImportPreview);
  element('product-import-apply')?.addEventListener('click', () => { void applyImportProducts(onApplied); });
  element('product-import-body')?.addEventListener('input', (event) => {
    if (event.target?.matches?.('[data-import-field], [data-import-excluded]')) scheduleImportValidation();
  });
  element('product-import-body')?.addEventListener('change', (event) => {
    if (event.target?.matches?.('select[data-import-field], [data-import-excluded]')) scheduleImportValidation(80);
  });
}
