import { ValidationError } from './errors.js';

export function positiveId(value, field = 'id') {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw new ValidationError(`Поле «${field}» должно быть положительным целым числом.`);
  }
  return id;
}

export function optionalPositiveId(value, field = 'id') {
  return value === undefined || value === null || value === '' ? null : positiveId(value, field);
}
