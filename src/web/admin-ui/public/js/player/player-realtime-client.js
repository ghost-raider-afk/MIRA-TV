const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000];
const REPROVISION_PARAM = 'reprovision';
const CONNECT_TIMEOUT_MS = 15_000;

function validCommandId(value) {
  const id = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : '';
}

function currentReprovisionCommand() {
  try { return validCommandId(new URL(location.href).searchParams.get(REPROVISION_PARAM)); }
  catch { return ''; }
}

function recoveryUrl(commandId) {
  const url = new URL('/tv-recovery', location.origin);
  url.searchParams.set(REPROVISION_PARAM, commandId);
  return url.href;
}

export function createPlayerRealtimeClient({ onChanged, onConnected, onDisconnected, onRevoked, onNetworkOnline } = {}) {
  let socket = null;
  let retryTimer = null;
  let connectTimer = null;
  let attempt = 0;
  let stopped = true;

  function clearRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function clearConnectTimer() {
    if (connectTimer) clearTimeout(connectTimer);
    connectTimer = null;
  }

  function retryDelay() {
    const base = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    const jitter = Math.floor(Math.random() * Math.max(250, base * 0.2));
    attempt += 1;
    return base + jitter;
  }

  function scheduleReconnect() {
    if (stopped || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, retryDelay());
  }

  function acknowledgeRecoveredPlayer(target) {
    const commandId = currentReprovisionCommand();
    if (!commandId || target.readyState !== WebSocket.OPEN) return;
    try { target.send(JSON.stringify({ type:'reprovision.ack', command_id:commandId })); } catch {}
  }

  function connect() {
    if (stopped || socket) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let next;
    try {
      next = new WebSocket(`${protocol}//${location.host}/ws/device`);
    } catch {
      scheduleReconnect();
      return;
    }
    socket = next;

    function disconnect(event) {
      // A late close from an obsolete socket must not mark a newer one offline.
      if (socket !== next) return;
      socket = null;
      clearConnectTimer();
      onDisconnected?.({
        code:Number(event?.code) || 0,
        reason:String(event?.reason || '').slice(0, 80),
        was_clean:event?.wasClean === true
      });
      window.dispatchEvent(new CustomEvent('mira:player-realtime-disconnected'));
      scheduleReconnect();
    }

    // Some old Chromium builds can remain CONNECTING forever without error/close.
    connectTimer = setTimeout(() => {
      if (socket !== next || next.readyState === WebSocket.OPEN) return;
      disconnect();
      try { next.close(); } catch {}
    }, CONNECT_TIMEOUT_MS);

    next.addEventListener('open', () => {
      if (socket !== next) return;
      clearConnectTimer();
      attempt = 0;
      onConnected?.();
      acknowledgeRecoveredPlayer(next);
      window.dispatchEvent(new CustomEvent('mira:player-realtime-connected'));
    });
    next.addEventListener('message', (event) => {
      if (socket !== next || typeof event.data !== 'string') return;
      try {
        const message = JSON.parse(event.data);
        if (message?.type === 'context.changed') {
          window.dispatchEvent(new CustomEvent('mira:player-realtime-change', { detail: message }));
          const reprovision = validCommandId(message.force_reprovision);
          if (reprovision && reprovision !== currentReprovisionCommand()) {
            location.replace(recoveryUrl(reprovision));
            return;
          }
          if (message.force_render === true) {
            location.reload();
            return;
          }
          onChanged?.(message);
        } else if (message?.type === 'device.revoked') {
          stop();
          onRevoked?.();
        } else if (message?.type === 'preview.request') {
          window.dispatchEvent(new CustomEvent('mira:player-preview-request'));
        }
      } catch {}
    });
    next.addEventListener('close', disconnect);
    next.addEventListener('error', () => {
      try { next.close(); } catch {}
    });
  }

  function handleOnline() {
    connect();
    // A restored network must reconcile even if old Chromium left the socket OPEN.
    onNetworkOnline?.();
  }

  function handleOffline() {
    // navigator.onLine is only a hint on TV browsers. Keep a working socket alive
    // and let the transport close/error path decide whether realtime is unavailable.
    if (!socket) scheduleReconnect();
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    connect();
  }

  function stop() {
    stopped = true;
    clearRetry();
    clearConnectTimer();
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    const current = socket;
    socket = null;
    if (current) {
      try { current.close(1000, 'player stopped'); } catch {}
    }
  }

  return Object.freeze({ start, stop, get connected() { return socket?.readyState === WebSocket.OPEN; } });
}
