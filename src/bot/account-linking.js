import { createHash, randomBytes } from 'node:crypto';
import { ValidationError } from '../shared/errors.js';

const PROVIDERS = new Set(['telegram','max']);
const INT64_MAX = 9223372036854775807n;
export const LINK_CODE_TTL_MS = 5 * 60 * 1000;

export function messengerProvider(value) {
  if (typeof value !== 'string' || !PROVIDERS.has(value)) {
    throw new ValidationError('Неизвестный мессенджер.');
  }
  return value;
}
export function createMessengerLinkCode() {
  return randomBytes(16).toString('base64url');
}
export function messengerLinkCodeHash(code) {
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(code)) {
    throw new ValidationError('Некорректный код привязки.');
  }
  return createHash('sha256').update(code).digest('hex');
}
export function messengerIdentityId(value) {
  const id = String(value ?? '');
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > INT64_MAX) {
    throw new ValidationError('Некорректный идентификатор мессенджера.');
  }
  return id;
}
