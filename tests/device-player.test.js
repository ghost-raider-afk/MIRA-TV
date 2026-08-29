import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createActivationCredentials,
  deterministicDeviceSessionToken,
  deviceSessionCookie,
  parseReserveCode,
  parseScanPayload,
  tokenHash
} from '../src/services/device-session-service.js';
import { activationQrPayload, createActivationQrSvg } from '../src/services/qr-code-service.js';

const config = {
  sessionSecret: 's'.repeat(48),
  deviceSessionTtlDays: 365,
  secureCookies: true
};

test('TV activation credentials separate QR claim, polling secret and fallback code', () => {
  const credentials = createActivationCredentials();
  assert.match(credentials.id, /^[0-9a-f-]{36}$/i);
  assert.match(credentials.scanToken, /^[A-Za-z0-9_-]{22}$/);
  assert.match(credentials.pollSecret, /^[A-Za-z0-9_-]{43}$/);
  assert.match(credentials.reserveCode, /^\d{6}$/);
  assert.notEqual(tokenHash(credentials.scanToken), credentials.scanToken);
  assert.notEqual(tokenHash(credentials.pollSecret), credentials.pollSecret);
});

test('QR contains only short-lived scan claim and never contains polling secret', () => {
  const credentials = createActivationCredentials();
  const payload = activationQrPayload(credentials.scanToken);
  const svg = createActivationQrSvg(credentials.scanToken);
  assert.equal(payload, `TV2:${credentials.scanToken}`);
  assert.match(svg, /^<svg/);
  assert.match(svg, /aria-label="QR-код подключения телевизора"/);
  assert.equal(svg.includes(credentials.pollSecret), false);
  assert.equal(svg.includes(credentials.reserveCode), false);
});

test('admin scanner accepts only canonical TV2 QR payload and six digit fallback code', () => {
  const credentials = createActivationCredentials();
  assert.equal(parseScanPayload(`TV2:${credentials.scanToken}`), credentials.scanToken);
  assert.equal(parseScanPayload(`https://example.test/?token=${credentials.scanToken}`), null);
  assert.equal(parseReserveCode('123 456'), '123456');
  assert.equal(parseReserveCode('12345'), null);
  assert.equal(parseReserveCode('12345x'), null);
});

test('device session token is deterministic for activation recovery but opaque to the TV page', () => {
  const credentials = createActivationCredentials();
  const first = deterministicDeviceSessionToken(credentials.id, credentials.pollSecret, config);
  const second = deterministicDeviceSessionToken(credentials.id, credentials.pollSecret, config);
  assert.equal(first, second);
  assert.match(first, /^dvs_[A-Za-z0-9_-]{43}$/);
  assert.equal(first.includes(credentials.id), false);
  assert.equal(first.includes(credentials.pollSecret), false);
});

test('device cookie is HttpOnly, strict and secure independently from admin session', () => {
  const cookie = deviceSessionCookie('dvs_test', config);
  assert.match(cookie, /^menu_tv_device_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Max-Age=31536000/);
});
