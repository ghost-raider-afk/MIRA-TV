(() => {
  const root = document.documentElement;
  const player = document.querySelector('[data-tv-player]');
  const playerStage = document.querySelector('[data-player-stage]');
  const visualViewport = window.visualViewport;
  const runtimeBootId = `fullscreen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`.slice(0, 64);
  let runtimeSequence = 0;
  let gestureArmed = false;
  let automaticAttempted = false;
  let hintShown = false;
  let hintNode = null;
  let lastRuntimeState = '';
  let lastFullscreenError = '';

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
      mode: apiFullscreen
        ? 'fullscreen-api'
        : displayFullscreen
          ? 'display-fullscreen'
          : standaloneDisplay
            ? 'standalone'
            : 'browser',
      fullscreen_enabled: Boolean(document.fullscreenEnabled ?? document.webkitFullscreenEnabled),
      request_supported: typeof fullscreenRequest() === 'function',
      last_error: lastFullscreenError || null
    };
  }

  function reportRuntimeState() {
    if (!playerVisible()) return;
    const state = fullscreenRuntimeState();
    const fingerprint = JSON.stringify(state);
    if (fingerprint === lastRuntimeState) return;
    const seq = runtimeSequence + 1;
    lastRuntimeState = fingerprint;
    void fetch('/api/device/player-logs', {
      method:'POST',
      credentials:'include',
      cache:'no-store',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({
        boot_id:runtimeBootId,
        events:[{
          seq,
          level:'info',
          type:'fullscreen.state',
          revision:'',
          device_timestamp:new Date().toISOString(),
          data:state
        }]
      })
    }).then((response) => {
      if (response.ok) runtimeSequence = seq;
      else lastRuntimeState = '';
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

  function fullscreenError(error) {
    const name = String(error?.name || '').trim();
    const message = String(error?.message || '').trim();
    return [name, message].filter(Boolean).join(': ').slice(0, 240) || 'Fullscreen request rejected';
  }

  function hideFullscreenHint() {
    hintNode?.remove();
    hintNode = null;
  }

  function showFullscreenHint() {
    if (hintShown || !playerVisible() || standalone() || fullscreenElement()) return;
    hintShown = true;
    const hint = document.createElement('div');
    hint.className = 'player-fullscreen-hint';
    hint.textContent = 'Нажмите OK для полноэкранного режима';
    hint.setAttribute('role', 'status');
    hint.setAttribute('aria-live', 'polite');
    hint.addEventListener('animationend', () => {
      if (hintNode === hint) hintNode = null;
      hint.remove();
    }, { once:true });
    player.append(hint);
    hintNode = hint;
  }

  function requestFullscreenCompat() {
    const request = fullscreenRequest();
    if (typeof request !== 'function' || standalone() || fullscreenElement()) return Promise.resolve(false);
    try {
      return Promise.resolve(request.call(root)).then(() => {
        const entered = Boolean(fullscreenElement());
        lastFullscreenError = entered ? '' : 'Fullscreen не активирован браузером.';
        return entered;
      }).catch((error) => {
        lastFullscreenError = fullscreenError(error);
        return false;
      });
    } catch (error) {
      lastFullscreenError = fullscreenError(error);
      return Promise.resolve(false);
    }
  }

  function tryAutomaticFullscreen() {
    if (automaticAttempted || !playerVisible() || standalone() || fullscreenElement()) return;
    automaticAttempted = true;
    void requestFullscreenCompat().then((entered) => {
      syncViewport();
      if (entered) {
        hideFullscreenHint();
        disarmGesture();
      } else {
        armGesture();
        showFullscreenHint();
      }
      reportRuntimeState();
    });
  }

  function enterFromGesture(event) {
    if (!playerVisible()) return;
    if (event?.type === 'keydown') {
      const key = String(event.key || '');
      const keyCode = Number(event.keyCode || event.which || 0);
      if (!['Enter', 'NumpadEnter', 'Select'].includes(key) && ![13, 23].includes(keyCode)) return;
    }
    void requestFullscreenCompat().then((entered) => {
      syncViewport();
      if (entered) {
        hideFullscreenHint();
        disarmGesture();
      }
      reportRuntimeState();
    });
  }

  function onFullscreenChange() {
    syncViewport();
    if (fullscreenElement()) {
      lastFullscreenError = '';
      hideFullscreenHint();
      disarmGesture();
    } else {
      armGesture();
    }
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
    if (event.detail?.active !== true) return;
    tryAutomaticFullscreen();
    reportRuntimeState();
  });
  window.addEventListener('mira:player-realtime-connected', reportRuntimeState);
  window.addEventListener('online', reportRuntimeState, { passive:true });
})();
