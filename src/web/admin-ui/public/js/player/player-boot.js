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

  function showCompatibilityFailure() {
    setStatus('MIRA-TV Player не запустился. Обновите браузер Chrome / Android System WebView на телевизоре и перезапустите страницу.');
  }

  function recoverPlayerShell() {
    // Never remove a working offline shell during a server outage.
    // An explicit administrator Apply remains the opt-in destructive recovery.
    setStatus('MIRA-TV Player не запустился. Сохранённый кэш не удалён. Проверяем восстановление сервера…');
    var delay = 15000;
    function checkServer() {
      if (window.__miraPlayerModuleStarted === true) return;
      var url = '/js/player/player.js?mira_boot_check=' + Date.now();
      fetch(url, { cache:'no-store', credentials:'same-origin' }).then(function (response) {
        if (!response.ok || !/javascript|ecmascript/.test(response.headers.get('content-type') || '')) {
          throw new Error('Player source unavailable');
        }
        if (sessionValue(RECOVERY_KEY) === '1') return;
        setSessionValue(RECOVERY_KEY, '1');
        window.location.reload();
      }).catch(function () {
        delay = Math.min(300000, delay * 2);
        window.setTimeout(checkServer, delay);
      });
    }
    window.setTimeout(checkServer, delay);
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
