import { ValidationError } from './errors.js';

export function requireText(value, field, { max = 120 } = {}) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > max) {
    throw new ValidationError(`Поле «${field}» должно содержать от 1 до ${max} символов.`);
  }
  return value.trim();
}

export function optionalText(value, field, { max = 300 } = {}) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.trim().length > max) {
    throw new ValidationError(`Поле «${field}» должно содержать не более ${max} символов.`);
  }
  return value.trim();
}
