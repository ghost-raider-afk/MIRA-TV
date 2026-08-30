import { ValidationError } from '../shared/errors.js';

export function mediaAssetIdParam(value) {
  const id = String(value || '').trim();
  if (!/^media-[0-9a-f-]{36}$/i.test(id)) throw new ValidationError('Некорректный идентификатор медиафайла.');
  return id;
}
