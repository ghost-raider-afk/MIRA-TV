import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/web/admin-ui/public/player-sw.js', import.meta.url), 'utf8');

function serviceWorkerHarness(cacheNames) {
  const handlers = new Map();
  const navigated = [];
  const deleted = [];
  let claimed = 0;
  let updateChecks = 0;

  const context = {
    URL,
    AbortController,
    Request,
    Response,
    console,
    setTimeout,
    clearTimeout,
    fetch: async () => new Response('', { status: 200 }),
    caches: {
      async keys() { return [...cacheNames]; },
      async delete(name) { deleted.push(name); return true; },
      async open() {
        return {
          async addAll() {},
          async match() { return null; },
          async put() {},
          async keys() { return []; },
          async delete() { return false; }
        };
      }
    },
    self: {
      location: { origin: 'https://tv.example' },
      registration: {
        async update() { updateChecks += 1; }
      },
      skipWaiting() {},
      clients: {
        async claim() { claimed += 1; },
        async matchAll() {
          return [
            { url: 'https://tv.example/player', async navigate(url) { navigated.push(url); } },
            { url: 'https://tv.example/signin', async navigate(url) { navigated.push(url); } }
          ];
        }
      },
      addEventListener(type, handler) { handlers.set(type, handler); }
    }
  };

  vm.runInNewContext(source, context, { filename:'player-sw.js' });
  return { handlers, navigated, deleted, claimed:() => claimed, updateChecks:() => updateChecks };
}

async function activate(harness) {
  let work = null;
  harness.handlers.get('activate')({ waitUntil(promise) { work = promise; } });
  await work;
}

async function sendMessage(harness, type) {
  let work = null;
  let reply = null;
  harness.handlers.get('message')({
    data:{ type },
    ports:[{ postMessage(value) { reply = value; } }],
    waitUntil(promise) { work = promise; }
  });
  if (work) await work;
  return reply;
}

test('upgraded Offline Player shell reloads only controlled /player clients once', async () => {
  const harness = serviceWorkerHarness([
    'mira-tv-player-shell-v71',
    'mira-tv-player-shell-v72',
    'mira-tv-player-data-v18'
  ]);
  await activate(harness);
  assert.equal(harness.claimed(), 1);
  assert.deepEqual(harness.navigated, ['https://tv.example/player']);
  assert.ok(harness.deleted.includes('mira-tv-player-shell-v70'));
});

test('first Offline Player shell install does not reload the Player', async () => {
  const harness = serviceWorkerHarness([
    'mira-tv-player-shell-v72',
    'mira-tv-player-data-v18'
  ]);
  await activate(harness);
  assert.equal(harness.claimed(), 1);
  assert.deepEqual(harness.navigated, []);
});

test('Local-first handshake checks for a newer shell without a polling loop', async () => {
  const harness = serviceWorkerHarness([
    'mira-tv-player-shell-v72',
    'mira-tv-player-data-v18'
  ]);
  const first = await sendMessage(harness, 'mira:player-cache-capabilities');
  assert.equal(first?.local_first, true);
  assert.equal(harness.updateChecks(), 1);

  await sendMessage(harness, 'mira:player-cache-capabilities');
  assert.equal(harness.updateChecks(), 1);
});
