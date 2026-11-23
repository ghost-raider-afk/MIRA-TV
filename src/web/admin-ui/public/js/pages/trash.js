import { api } from '../core/api.js';
import { makeButton, recordRow, refreshList, setMessage } from '../core/dom.js';

const TRASH_API = '/api/trash';

function dateTime(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString('ru-RU') : 'Время неизвестно';
}

async function restore(entry) {
  try {
    await api.post(`${TRASH_API}/${entry.type}/${entry.id}/restore`, {});
    setMessage('trash-message', `Восстановлено: ${entry.name}.`, 'success');
    await loadTrash();
  } catch (error) {
    setMessage('trash-message', error.message);
  }
}

function renderType(entries, type, listName) {
  const list = document.querySelector(`[data-trash-${listName}]`);
  const empty = document.querySelector(`[data-trash-${listName}-empty]`);
  if (!list || !empty) return;
  const records = entries.filter((entry) => entry.type === type).map((entry) => {
    const parts = [`Удалено: ${dateTime(entry.deleted_at)}`, `Кем: ${entry.deleted_by || 'неизвестно'}`];
    if (type === 'screen') parts.push(`Точка: ${entry.location_name || 'неизвестна'}`);
    if (type === 'location') parts.push(`ТВ: ${entry.screen_count || 0}`);
    const button = makeButton('Восстановить', '', () => void restore(entry));
    if (type === 'screen' && entry.location_deleted_at) {
      button.disabled = true;
      button.title = 'Сначала восстановите торговую точку.';
      parts.push('Сначала восстановите торговую точку');
    }
    return recordRow(entry.name, parts.join(' · '), [button]);
  });
  refreshList(list, empty, records);
}

async function loadTrash() {
  const entries = await api.get(TRASH_API);
  renderType(entries, 'product', 'products');
  renderType(entries, 'screen', 'screens');
  renderType(entries, 'location', 'locations');
}

export function initialiseTrash() {
  void loadTrash().catch((error) => setMessage('trash-message', error.message));
}
