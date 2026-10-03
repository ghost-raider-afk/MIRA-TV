import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedDeviceWebSocketOrigin } from '../src/realtime/player-realtime.js';

function request(headers = {}, encrypted = false) {
  return { headers, socket: { encrypted } };
}

test('device WebSocket accepts the exact browser origin used by the current MIRA-TV host', () => {
  assert.equal(isAllowedDeviceWebSocketOrigin(request({
    host: '127.0.0.1:8080',
    origin: 'http://127.0.0.1:8080'
  })), true);
});

test('device WebSocket trusts Traefik forwarded scheme and host for the public MIRA-TV origin', () => {
  assert.equal(isAllowedDeviceWebSocketOrigin(request({
    host: 'app:8080',
    'x-forwarded-host': 'mira.example.test',
    'x-forwarded-proto': 'https',
    origin: 'https://mira.example.test'
  })), true);
});

test('device WebSocket rejects cross-origin, missing and scheme-mismatched upgrades', () => {
  assert.equal(isAllowedDeviceWebSocketOrigin(request({
    host: 'mira.example.test',
    origin: 'https://evil.example.test'
  }, true)), false);
  assert.equal(isAllowedDeviceWebSocketOrigin(request({ host: 'mira.example.test' }, true)), false);
  assert.equal(isAllowedDeviceWebSocketOrigin(request({
    host: 'app:8080',
    'x-forwarded-host': 'mira.example.test',
    'x-forwarded-proto': 'https',
    origin: 'http://mira.example.test'
  })), false);
});

test('device WebSocket rejects malformed or opaque origins', () => {
  assert.equal(isAllowedDeviceWebSocketOrigin(request({
    host: 'mira.example.test',
    origin: 'null'
  }, true)), false);
  assert.equal(isAllowedDeviceWebSocketOrigin(request({
    host: 'mira.example.test',
    origin: 'not a url'
  }, true)), false);
});
