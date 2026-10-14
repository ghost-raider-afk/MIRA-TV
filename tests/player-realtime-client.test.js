import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlayerRealtimeClient } from '../src/web/admin-ui/public/js/player/player-realtime-client.js';

function replaceGlobal(name, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable:true, writable:true, value });
  return () => {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else delete globalThis[name];
  };
}

test('Player realtime keeps transport authoritative when Android TV reports navigator offline', () => {
  const sockets = [];
  class FakeWebSocket extends EventTarget {
    static OPEN = 1;

    constructor(url) {
      super();
      this.url = url;
      this.readyState = 0;
      this.closeCalls = [];
      sockets.push(this);
    }

    close(code, reason) {
      this.closeCalls.push({ code, reason });
      this.readyState = 3;
    }
  }

  const fakeWindow = new EventTarget();
  const restore = [
    replaceGlobal('navigator', { onLine:false }),
    replaceGlobal('location', { protocol:'https:', host:'mira.example.test' }),
    replaceGlobal('window', fakeWindow),
    replaceGlobal('WebSocket', FakeWebSocket),
    replaceGlobal('CustomEvent', globalThis.CustomEvent || class CustomEvent extends Event {
      constructor(type, options = {}) {
        super(type);
        this.detail = options.detail;
      }
    })
  ];

  let connected = 0;
  let disconnected = 0;
  const client = createPlayerRealtimeClient({
    onConnected:() => { connected += 1; },
    onDisconnected:() => { disconnected += 1; }
  });

  try {
    client.start();
    assert.equal(sockets.length, 1, 'navigator.onLine=false must not block the WebSocket attempt');
    assert.equal(sockets[0].url, 'wss://mira.example.test/ws/device');

    sockets[0].readyState = FakeWebSocket.OPEN;
    sockets[0].dispatchEvent(new Event('open'));
    assert.equal(client.connected, true);
    assert.equal(connected, 1);

    fakeWindow.dispatchEvent(new Event('offline'));
    assert.equal(sockets[0].closeCalls.length, 0, 'an advisory offline event must not tear down a working socket');
    assert.equal(client.connected, true);
    assert.equal(disconnected, 0);

    client.stop();
    assert.deepEqual(sockets[0].closeCalls, [{ code:1000, reason:'player stopped' }]);
  } finally {
    client.stop();
    for (const undo of restore.reverse()) undo();
  }
});
