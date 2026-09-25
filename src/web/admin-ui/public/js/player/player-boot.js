(function () {
  'use strict';

  var RECOVERY_KEY = 'mira-tv.player-boot-recovery.v1';
  var WATCHDOG_MS = 7000;
  var watchdog = null;

  function bootRoot() {
    return document.querySelector('[data-player-boot]');
  }

  function bootStatus() {
    return document.querySelector('[data-player-boot-status]');
  }

  function setStatus(text) {
    var root = bootRoot();
    var status = bootStatus();
    if (root) root.classList.remove('is-hidden');
    if (status) status.textContent = text;
  }

  function sessionValue(key) {
    try { return window.sessionStorage.getItem(key) || ''; }
    catch (_error) { return ''; }
  }

  function setSessionValue(key, value) {
    try { window.sessionStorage.setItem(key, value); }
    catch (_error) {}
  }

  function removeSessionValue(key) {
    try { window.sessionStorage.removeItem(key); }
    catch (_error) {}
  }

  function moduleScriptsSupported() {
    var script = document.createElement('script');
    return 'noModule' in script;
  }

  function unregisterPlayerWorkers() {
    if (!navigator.serviceWorker || typeof navigator.serviceWorker.getRegistrations !== 'function') {
      return Promise.resolve();
    }
    return navigator.serviceWorker.getRegistrations().then(function (registrations) {
      return Promise.all(registrations.map(function (registration) {
        var scriptUrl = '';
        var worker = registration.active || registration.waiting || registration.installing;
        if (worker && worker.scriptURL) scriptUrl = worker.scriptURL;
        try {
          var script = new URL(scriptUrl, window.location.origin);
          var scope = new URL(registration.scope || '', window.location.origin);
          if (script.origin !== window.location.origin || script.pathname !== '/player-sw.js') return false;
          if (scope.origin !== window.location.origin || scope.pathname.indexOf('/player') !== 0) return false;
          return registration.unregister();
        } catch (_error) {
          return false;
        }
      }));
    });
  }

  function clearPlayerShellCaches() {
    if (!window.caches || typeof window.caches.keys !== 'function') return Promise.resolve();
    return window.caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        if (name.indexOf('mira-tv-player-shell-') !== 0) return false;
        return window.caches.delete(name);
      }));
    });
  }

  function showCompatibilityFailure() {
    setStatus('MIRA-TV Player не запустился. Обновите браузер Chrome / Android System WebView на телевизоре и перезапустите страницу.');
  }

  function recoverPlayerShell() {
    if (sessionValue(RECOVERY_KEY) === '1') {
      showCompatibilityFailure();
      return;
    }
    if (typeof Promise !== 'function') {
      showCompatibilityFailure();
      return;
    }

    setSessionValue(RECOVERY_KEY, '1');
    setStatus('Восстанавливаем локальный MIRA-TV Player…');

    Promise.all([
      unregisterPlayerWorkers(),
      clearPlayerShellCaches()
    ]).then(function () {
      window.location.reload();
    }).catch(function () {
      window.location.reload();
    });
  }

  function inspectBoot() {
    if (window.__miraPlayerBootReady === true) return;

    if (!moduleScriptsSupported()) {
      showCompatibilityFailure();
      return;
    }

    if (window.__miraPlayerModuleStarted === true) return;

    recoverPlayerShell();
  }

  function startWatchdog() {
    var root = bootRoot();
    if (!root) return;
    root.classList.remove('is-hidden');
    if (watchdog) window.clearTimeout(watchdog);
    watchdog = window.setTimeout(inspectBoot, WATCHDOG_MS);
  }

  window.__miraPlayerFinishBoot = function () {
    window.__miraPlayerBootReady = true;
    removeSessionValue(RECOVERY_KEY);
    if (watchdog) window.clearTimeout(watchdog);
    watchdog = null;
    var root = bootRoot();
    if (root) root.classList.add('is-hidden');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startWatchdog, { once: true });
  } else {
    startWatchdog();
  }
}());
