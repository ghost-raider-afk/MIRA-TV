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
  return { handlers, navigated, deleted, claimed:() => claimed };
}

async function activate(harness) {
  let work = null;
  harness.handlers.get('activate')({ waitUntil(promise) { work = promise; } });
  await work;
}

test('upgraded Offline Player shell reloads only controlled /player clients once', async () => {
  const harness = serviceWorkerHarness([
    'mira-tv-player-shell-v69',
    'mira-tv-player-shell-v70',
    'mira-tv-player-data-v18'
  ]);
  await activate(harness);
  assert.equal(harness.claimed(), 1);
  assert.deepEqual(harness.navigated, ['https://tv.example/player']);
  assert.ok(harness.deleted.includes('mira-tv-player-shell-v69'));
});

test('first Offline Player shell install does not reload the Player', async () => {
  const harness = serviceWorkerHarness([
    'mira-tv-player-shell-v70',
    'mira-tv-player-data-v18'
  ]);
  await activate(harness);
  assert.equal(harness.claimed(), 1);
  assert.deepEqual(harness.navigated, []);
});
