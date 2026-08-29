import { ValidationError } from '../shared/errors.js';
import { requireText } from './input.js';

export function sceneRevisionIdParam(value) {
  const id = requireText(value, 'scene_revision_id', { max: 160 });
  if (!/^scene-revision-[A-Za-z0-9-]+$/.test(id)) throw new ValidationError('Некорректный идентификатор опубликованной сцены.');
  return id;
}
