"use strict";

const LEGACY_PLAYER_SW_CLEANUP_KEY = 'mira-tv.legacy-player-sw-cleanup.v1';

function playerWorkerScript(registration) {
  return registration?.active?.scriptURL
    || registration?.waiting?.scriptURL
    || registration?.installing?.scriptURL
    || '';
}

function isLegacyRootPlayerRegistration(registration) {
  try {
    const scope = new URL(registration?.scope || '', window.location.origin);
    const script = new URL(playerWorkerScript(registration), window.location.origin);
    return scope.origin === window.location.origin
      && scope.pathname === '/'
      && script.origin === window.location.origin
      && script.pathname === '/player-sw.js';
  } catch {
    return false;
  }
}

async function retireLegacyRootPlayerWorker() {
  if (!('serviceWorker' in navigator) || typeof navigator.serviceWorker.getRegistrations !== 'function') return false;
  const registrations = await navigator.serviceWorker.getRegistrations();
  const legacy = registrations.filter(isLegacyRootPlayerRegistration);
  if (!legacy.length) return false;

  const controller = navigator.serviceWorker.controller;
  const controlledByLegacyPlayer = (() => {
    try {
      const script = new URL(controller?.scriptURL || '', window.location.origin);
      return script.origin === window.location.origin && script.pathname === '/player-sw.js';
    } catch {
      return false;
    }
  })();

  await Promise.all(legacy.map((registration) => registration.unregister().catch(() => false)));

  if ('caches' in window) {
    const names = await caches.keys().catch(() => []);
    await Promise.all(names
      .filter((name) => name.startsWith('mira-tv-player-shell-'))
      .map((name) => caches.delete(name).catch(() => false)));
  }

  if (controlledByLegacyPlayer) {
    let alreadyReloaded = false;
    try {
      alreadyReloaded = sessionStorage.getItem(LEGACY_PLAYER_SW_CLEANUP_KEY) === 'done';
      sessionStorage.setItem(LEGACY_PLAYER_SW_CLEANUP_KEY, 'done');
    } catch {}
    if (!alreadyReloaded) {
      location.reload();
      return true;
    }
  }
  return false;
}

void (async () => {
  if (await retireLegacyRootPlayerWorker()) return;
  await import('/js/application.js');
})().catch((error) => {
  console.error('MIRA-TV frontend failed to load', error);
  const target = document.querySelector('[role="status"], .form-message');
  if (target) {
    target.textContent = 'Не удалось загрузить интерфейс. Обновите страницу.';
    target.classList.remove('is-hidden');
    target.classList.add('is-error');
  }
});
