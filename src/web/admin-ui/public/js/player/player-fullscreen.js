(() => {
  const root = document.documentElement;
  const player = document.querySelector('[data-tv-player]');
  const playerStage = document.querySelector('[data-player-stage]');
  const visualViewport = window.visualViewport;
  let gestureArmed = false;
  let lastRuntimeState = '';

  function displayMode(query) {
    try { return window.matchMedia?.(query).matches === true; }
    catch { return false; }
  }

  function standalone() {
    return Boolean(
      displayMode('(display-mode: fullscreen)')
      || displayMode('(display-mode: standalone)')
      || navigator.standalone === true
    );
  }

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function fullscreenRequest() {
    return root.requestFullscreen || root.webkitRequestFullscreen || null;
  }

  function fullscreenRuntimeState() {
    const apiFullscreen = Boolean(fullscreenElement());
    const displayFullscreen = displayMode('(display-mode: fullscreen)');
    const standaloneDisplay = displayMode('(display-mode: standalone)') || navigator.standalone === true;
    return {
      fullscreen: {
        mode: apiFullscreen
          ? 'fullscreen-api'
          : displayFullscreen
            ? 'display-fullscreen'
            : standaloneDisplay
              ? 'standalone'
              : 'browser',
        fullscreen_enabled: Boolean(document.fullscreenEnabled ?? document.webkitFullscreenEnabled),
        request_supported: typeof fullscreenRequest() === 'function'
      }
    };
  }

  function reportRuntimeState() {
    if (!playerVisible()) return;
    const state = fullscreenRuntimeState();
    const fingerprint = JSON.stringify(state);
    if (fingerprint === lastRuntimeState) return;
    lastRuntimeState = fingerprint;
    void fetch('/api/device/runtime-state', {
      method:'POST',
      credentials:'include',
      cache:'no-store',
      headers:{ 'content-type':'application/json' },
      body:fingerprint
    }).then((response) => {
      if (!response.ok) lastRuntimeState = '';
    }).catch(() => {
      lastRuntimeState = '';
    });
  }

  function syncViewport() {
    const viewport = window.visualViewport;
    const width = Math.max(1, Math.round(viewport?.width || window.innerWidth || root.clientWidth || 1));
    const height = Math.max(1, Math.round(viewport?.height || window.innerHeight || root.clientHeight || 1));
    const left = Math.round(viewport?.offsetLeft || 0);
    const top = Math.round(viewport?.offsetTop || 0);
    root.style.setProperty('--mira-player-viewport-width', `${width}px`);
    root.style.setProperty('--mira-player-viewport-height', `${height}px`);
    root.style.setProperty('--mira-player-viewport-left', `${left}px`);
    root.style.setProperty('--mira-player-viewport-top', `${top}px`);
  }

  function disarmGesture() {
    if (!gestureArmed) return;
    gestureArmed = false;
    window.removeEventListener('pointerdown', enterFromGesture, true);
    window.removeEventListener('keydown', enterFromGesture, true);
  }

  function armGesture() {
    if (gestureArmed || standalone() || fullscreenElement() || typeof fullscreenRequest() !== 'function') return;
    gestureArmed = true;
    window.addEventListener('pointerdown', enterFromGesture, { capture:true, passive:true });
    window.addEventListener('keydown', enterFromGesture, true);
  }

  function playerVisible() {
    return player instanceof HTMLElement && !player.classList.contains('is-hidden');
  }

  function enterFromGesture(event) {
    if (!playerVisible()) return;
    if (event?.type === 'keydown' && ['Escape','Esc'].includes(event.key)) return;
    const request = fullscreenRequest();
    if (typeof request !== 'function' || standalone() || fullscreenElement()) {
      disarmGesture();
      return;
    }
    try {
      const result = request.call(root, { navigationUI:'hide' });
      Promise.resolve(result).then(() => {
        if (fullscreenElement()) disarmGesture();
        syncViewport();
      }).catch(() => undefined);
    } catch {}
  }

  function onFullscreenChange() {
    syncViewport();
    if (fullscreenElement()) disarmGesture();
    else armGesture();
    reportRuntimeState();
  }

  syncViewport();
  armGesture();
  window.addEventListener('resize', syncViewport, { passive:true });
  visualViewport?.addEventListener('resize', syncViewport, { passive:true });
  visualViewport?.addEventListener('scroll', syncViewport, { passive:true });
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  playerStage?.addEventListener('mira:player-active', (event) => {
    if (event.detail?.active === true) reportRuntimeState();
  });
  window.addEventListener('mira:player-realtime-connected', reportRuntimeState);
  window.addEventListener('online', reportRuntimeState, { passive:true });
})();
