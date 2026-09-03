import { ValidationError } from '../shared/errors.js';
import { requireText } from './input.js';

function itemIds(value) {
  const source = Array.isArray(value) ? value : [];
  if (source.length > 1000) throw new ValidationError('Одна подборка меню может содержать не более 1000 позиций.');
  const ids = [];
  for (const raw of source) {
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError('Подборка меню содержит некорректный идентификатор позиции.');
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function catalogViewInput(body) {
  const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  return {
    name: requireText(source.name, 'name', { max: 120 }),
    description: typeof source.description === 'string' ? source.description.trim().slice(0, 500) : '',
    active: source.active !== false,
    item_ids: itemIds(source.item_ids)
  };
}
