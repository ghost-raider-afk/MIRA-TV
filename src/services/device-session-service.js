import crypto from 'node:crypto';
import { parseCookies } from './session-service.js';

export const DEVICE_SESSION_COOKIE = 'mira_tv_device_session';
export const DEVICE_SCAN_PREFIX = 'MIRA:';
const LEGACY_DEVICE_SESSION_TTL_DAYS = 365;
const HARDENED_DEVICE_SESSION_TTL_DAYS = 30;
const DAY_MS = 86_400_000;

export function tokenHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function createActivationCredentials() {
  return Object.freeze({
    id: crypto.randomUUID(),
    scanToken: crypto.randomBytes(16).toString('base64url'),
    pollSecret: crypto.randomBytes(32).toString('base64url'),
    reserveCode: String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  });
}

export function parseScanPayload(value) {
  const text = String(value || '').trim();
  if (!text.startsWith(DEVICE_SCAN_PREFIX)) return null;
  const token = text.slice(DEVICE_SCAN_PREFIX.length);
  return /^[A-Za-z0-9_-]{22}$/.test(token) ? token : null;
}

export function parseReserveCode(value) {
  const code = String(value || '').replace(/\s+/g, '');
  return /^\d{6}$/.test(code) ? code : null;
}

export function deterministicDeviceSessionToken(activationId, pollSecret, config) {
  const digest = crypto
    .createHmac('sha256', config.sessionSecret)
    .update(`tv-device:${activationId}:${pollSecret}`)
    .digest('base64url');
  return `dvs_${digest}`;
}

export function rotatedDeviceSessionToken(sessionId, config) {
  const id = String(sessionId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new TypeError('Rotated TV session id is invalid.');
  const digest = crypto
    .createHmac('sha256', config.sessionSecret)
    .update(`tv-device-session:${id}`)
    .digest('base64url');
  return `dvs_${digest}`;
}

export function effectiveDeviceSessionTtlDays(config) {
  const configured = Number(config?.deviceSessionTtlDays);
  if (!Number.isSafeInteger(configured) || configured < 1) return HARDENED_DEVICE_SESSION_TTL_DAYS;
  return configured === LEGACY_DEVICE_SESSION_TTL_DAYS ? HARDENED_DEVICE_SESSION_TTL_DAYS : configured;
}

export function deviceSessionExpiresAt(config, now = Date.now()) {
  return new Date(now + effectiveDeviceSessionTtlDays(config) * DAY_MS).toISOString();
}

export function deviceSessionRotationDue(session, config, now = Date.now()) {
  const expiresAt = Date.parse(session?.expires_at || '');
  if (!Number.isFinite(expiresAt)) return true;
  const ttlDays = effectiveDeviceSessionTtlDays(config);
  const ttlMs = ttlDays * DAY_MS;
  const rotationWindowDays = Math.min(7, Math.max(1, Math.floor(ttlDays / 4)));
  const remainingMs = expiresAt - now;
  return remainingMs <= rotationWindowDays * DAY_MS || remainingMs > ttlMs + 5 * 60_000;
}

export function deviceSessionCookie(token, config, maxAge = effectiveDeviceSessionTtlDays(config) * 86400) {
  return `${DEVICE_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${config.secureCookies ? '; Secure' : ''}`;
}

export function deviceSessionTokenFromRequest(request) {
  return parseCookies(request)[DEVICE_SESSION_COOKIE] || '';
}

export function remoteAddress(request) {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim().slice(0, 128);
  return String(request.ip || request.socket?.remoteAddress || '').slice(0, 128);
}

export function userAgent(request) {
  return String(request.headers['user-agent'] || '').slice(0, 512);
}
