import { ValidationError } from '../shared/errors.js';

export function managerUsernameInput(value) {
  const username = typeof value === 'string' ? value.trim() : '';
  if (username.length < 3 || username.length > 64 || !/^[\p{L}\p{N}._-]+$/u.test(username)) {
    throw new ValidationError('Логин менеджера должен содержать от 3 до 64 букв, цифр или символов . _ -.');
  }
  return username;
}
