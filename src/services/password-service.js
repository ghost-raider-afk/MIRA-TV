import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { ValidationError } from '../shared/errors.js';

const scrypt = promisify(crypto.scrypt);

function newPasswordInput(value, field, config) {
  if (typeof value !== 'string' || value.length < config.passwordMinLength || value.length > config.passwordMaxLength) {
    throw new ValidationError(`Поле «${field}» должно содержать от ${config.passwordMinLength} до ${config.passwordMaxLength} символов.`);
  }
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    throw new ValidationError('Пароль должен содержать строчную и прописную латинскую букву, цифру и специальный символ.');
  }
  return value;
}

function currentPasswordInput(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError('Введите текущий пароль.');
  }
  return value;
}

export function passwordChangeInput(body, config) {
  const currentPassword = currentPasswordInput(body.current_password);
  const newPassword = newPasswordInput(body.new_password, 'Новый пароль', config);
  if (currentPassword === newPassword) throw new ValidationError('Новый пароль должен отличаться от текущего.');
  return { currentPassword, newPassword };
}

export function validateNewPassword(value, config, field = 'Пароль') {
  return newPasswordInput(value, field, config);
}

export function generatePassword(config) {
  const minimum = Number.parseInt(config?.passwordMinLength, 10);
  const maximum = Number.parseInt(config?.passwordMaxLength, 10);
  const preferred = Number.parseInt(config?.generatedPasswordLength, 10);
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 10 || maximum < minimum) {
    throw new Error('Некорректная конфигурация длины пароля.');
  }

  const targetLength = Math.min(maximum, Math.max(minimum, Number.isInteger(preferred) ? preferred : minimum));
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!%+,.:@^_~-';
  const alphabet = `${upper}${lower}${digits}${special}`;
  const take = (characters) => characters[crypto.randomInt(characters.length)];
  const characters = [take(upper), take(lower), take(digits), take(special)];

  while (characters.length < targetLength) characters.push(take(alphabet));
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }

  return newPasswordInput(characters.join(''), 'Пароль', config);
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}

export async function verifyPassword(password, passwordHash) {
  const [algorithm, encodedSalt, encodedHash] = String(passwordHash || '').split('$');
  if (algorithm !== 'scrypt' || !encodedSalt || !encodedHash) return false;
  try {
    const expected = Buffer.from(encodedHash, 'base64url');
    if (expected.length !== 64) return false;
    const actual = Buffer.from(await scrypt(password, Buffer.from(encodedSalt, 'base64url'), expected.length));
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
