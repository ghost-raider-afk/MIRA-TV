import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlayerRealtimeClient } from '../src/web/admin-ui/public/js/player/player-realtime-client.js';

function replace(name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable:true, writable:true, value });
  return () => original
    ? Object.defineProperty(globalThis, name, original)
    : delete globalThis[name];
}

function harness() {
  const sockets = [];
  const timers = new Map();
  let timerId = 0;
  let failConstructor = 0;
  class FakeSocket extends EventTarget {
    static OPEN = 1;
    constructor(url) {
      super();
      if (failConstructor-- > 0) throw new Error('Handshake failed');
      this.url = url;
      this.readyState = 0;
      this.closed = false;
      sockets.push(this);
    }
    open() { this.readyState = 1; this.dispatchEvent(new Event('open')); }
    close() { this.closed = true; this.readyState = 3; }
    end() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
    send() {}
    receive(value) { this.dispatchEvent(new MessageEvent('message', { data:JSON.stringify(value) })); }
  }
  const fakeWindow = new EventTarget();
  const restores = [
    replace('window', fakeWindow),
    replace('navigator', { onLine:true }),
    replace('location', { protocol:'https:', host:'mira.example', origin:'https://mira.example', href:'https://mira.example/player' }),
    replace('WebSocket', FakeSocket),
    replace('CustomEvent', globalThis.CustomEvent || class CustomEvent extends Event {
      constructor(type, opts = {}) { super(type); this.detail = opts.detail; }
    }),
    replace('setTimeout', (callback, ms) => {
      const id = ++timerId;
      timers.set(id, { callback, ms });
      return id;
    }),
    replace('clearTimeout', (id) => timers.delete(id))
  ];
  const run = (ms) => {
    const found = [...timers.entries()].find(([, value]) => value.ms === ms);
    assert.ok(found, `Expected pending timeout ${ms}, got ${[...timers.values()].map(x => x.ms)}`);
    timers.delete(found[0]);
    found[1].callback();
  };
  return {
    sockets, timers, run, fakeWindow,
    throwNext(count) { failConstructor = count; },
    cleanup() { for (const fn of restores.reverse()) fn(); }
  };
}

test('pass 1: failed WebSocket constructor still backs off and reconnects', () => {
  const h = harness();
  h.throwNext(1);
  const client = createPlayerRealtimeClient();
  try {
    client.start();
    assert.equal(h.sockets.length, 0);
    const retryMs = [...h.timers.values()][0]?.ms;
    assert.ok(retryMs >= 1000 && retryMs < 1300);
    h.run(retryMs);
    assert.equal(h.sockets.length, 1);
    h.sockets[0].open();
    assert.equal(client.connected, true);
    assert.equal(h.timers.size, 0, 'handshake watchdog cleared on open');
  } finally { client.stop(); h.cleanup(); }
});

test('pass 1: CONNECTING timeout starts reconnect even if old browser emits no close', () => {
  const h = harness();
  let disconnected = 0;
  const client = createPlayerRealtimeClient({ onDisconnected:() => { disconnected++; } });
  try {
    client.start();
    assert.equal(h.sockets.length, 1);
    h.run(15_000);
    assert.equal(h.sockets[0].closed, true);
    assert.equal(disconnected, 1);
    h.sockets[0].end();
    assert.equal(disconnected, 1, 'late close must be ignored');
    const retry = [...h.timers.values()][0]?.ms;
    assert.ok(retry >= 1000 && retry < 1300);
    h.run(retry);
    assert.equal(h.sockets.length, 2);
    h.sockets[1].open();
    assert.equal(client.connected, true);
  } finally { client.stop(); h.cleanup(); }
});

test('pass 2: successful connection ignores false offline hints, retries closes and stale events', () => {
  const h = harness();
  let connected = 0, disconnected = 0, rechecks = 0;
  const client = createPlayerRealtimeClient({
    onConnected:() => { connected++; },
    onDisconnected:() => { disconnected++; },
    onNetworkOnline:() => { rechecks++; }
  });
  try {
    client.start();
    h.sockets[0].open();
    h.fakeWindow.dispatchEvent(new Event('offline'));
    assert.equal(client.connected, true);
    assert.equal(h.sockets[0].closed, false);
    h.fakeWindow.dispatchEvent(new Event('online'));
    assert.equal(rechecks, 1, 'online must force delta while socket looks healthy');
    h.sockets[0].end();
    assert.equal(disconnected, 1);
    const retry = [...h.timers.values()][0]?.ms;
    h.run(retry);
    h.sockets[1].open();
    assert.equal(connected, 2);
    h.sockets[0].end();
    assert.equal(disconnected, 1, 'old socket event ignored after reconnect');
    assert.equal(client.connected, true);
    assert.equal(h.timers.size, 0);
  } finally { client.stop(); h.cleanup(); }
});

test('pass 2: revocation stops websocket reconnection and clears handshake timers', () => {
  const h = harness();
  let revoked = 0;
  const client = createPlayerRealtimeClient({ onRevoked:() => { revoked++; } });
  try {
    client.start();
    assert.equal(h.timers.size, 1);
    h.sockets[0].open();
    h.sockets[0].receive({ type:'device.revoked' });
    assert.equal(revoked, 1);
    assert.equal(client.connected, false);
    assert.equal(h.timers.size, 0);
    h.sockets[0].end();
    assert.equal(h.timers.size, 0, 'revoked device must not reconnect');
    h.fakeWindow.dispatchEvent(new Event('online'));
    assert.equal(h.sockets.length, 1);
  } finally { client.stop(); h.cleanup(); }
});

test('pass 2: invalid socket data is ignored, changes reconcile once, stop prevents late callbacks', () => {
  const h = harness();
  let changes = 0, disconnected = 0;
  const client = createPlayerRealtimeClient({
    onChanged:() => { changes++; },
    onDisconnected:() => { disconnected++; }
  });
  try {
    client.start();
    h.sockets[0].open();
    h.sockets[0].receive({ type:'unexpected' });
    h.sockets[0].receive({ type:'context.changed', revision:'new' });
    assert.equal(changes, 1);
    client.stop();
    h.sockets[0].end();
    assert.equal(disconnected, 0);
    assert.equal(h.timers.size, 0);
  } finally { client.stop(); h.cleanup(); }
});
