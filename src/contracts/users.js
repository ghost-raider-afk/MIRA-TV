import { ValidationError } from '../shared/errors.js';

export function managerUsernameInput(value) {
  const username = typeof value === 'string' ? value.trim() : '';
  if (username.length < 3 || username.length > 64 || !/^[\p{L}\p{N}._-]+$/u.test(username)) {
    throw new ValidationError('Логин менеджера должен содержать от 3 до 64 букв, цифр или символов . _ -.');
  }
  return username;
}

export function managerDisplayNameInput(value) {
  if (typeof value !== 'string') throw new ValidationError('Имя пользователя должно содержать от 1 до 80 символов.');
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 80 || /[\u0000-\u001f\u007f]/.test(value.replace(/\s/g, ''))) {
    throw new ValidationError('Имя пользователя должно содержать от 1 до 80 символов без управляющих символов.');
  }
  return name;
}
