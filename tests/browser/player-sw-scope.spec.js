import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

test('admin retires a legacy root-scoped Player worker before shared runtime modules load', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto('/signin');

    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/player-sw.js', { scope: '/' });
      const candidate = registration.installing || registration.waiting;
      if (candidate && candidate.state !== 'activated') {
        await new Promise((resolve) => {
          const onState = () => {
            if (candidate.state !== 'activated' && candidate.state !== 'redundant') return;
            candidate.removeEventListener('statechange', onState);
            resolve();
          };
          candidate.addEventListener('statechange', onState);
        });
      }
      const shell = await caches.open('mira-tv-player-shell-v999');
      await shell.put('/__legacy-shell-probe', new Response('shell'));
      const data = await caches.open('mira-tv-player-data-v18');
      await data.put('/__player-data-probe', new Response('data'));
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');

    await expect.poll(() => page.evaluate(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      return registrations.some((registration) => {
        const scope = new URL(registration.scope);
        const scriptUrl = registration.active?.scriptURL
          || registration.waiting?.scriptURL
          || registration.installing?.scriptURL
          || '';
        const script = scriptUrl ? new URL(scriptUrl) : null;
        return scope.pathname === '/' && script?.pathname === '/player-sw.js';
      });
    }), { timeout: 8000 }).toBe(false);

    await expect.poll(() => page.evaluate(async () => {
      const names = await caches.keys();
      return {
        legacyShell: names.includes('mira-tv-player-shell-v999'),
        playerData: names.includes('mira-tv-player-data-v18')
      };
    }), { timeout: 8000 }).toEqual({ legacyShell:false, playerData:true });

    await expect.poll(() => page.evaluate(() => {
      const controller = navigator.serviceWorker.controller;
      if (!controller) return '';
      try { return new URL(controller.scriptURL).pathname; } catch { return 'invalid'; }
    }), { timeout: 8000 }).not.toBe('/player-sw.js');
  } finally {
    await context.close();
  }
});
