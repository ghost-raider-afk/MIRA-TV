const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000];

export function createPlayerRealtimeClient({ onChanged, onConnected, onDisconnected } = {}) {
  let socket = null;
  let retryTimer = null;
  let attempt = 0;
  let stopped = true;

  function clearRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function retryDelay() {
    const base = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    const jitter = Math.floor(Math.random() * Math.max(250, base * 0.2));
    attempt += 1;
    return base + jitter;
  }

  function scheduleReconnect() {
    if (stopped || retryTimer || !navigator.onLine) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, retryDelay());
  }

  function connect() {
    if (stopped || socket || !navigator.onLine) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let next;
    try {
      next = new WebSocket(`${protocol}//${location.host}/ws/device`);
    } catch {
      scheduleReconnect();
      return;
    }
    socket = next;

    next.addEventListener('open', () => {
      if (socket !== next) return;
      attempt = 0;
      onConnected?.();
    });
    next.addEventListener('message', (event) => {
      if (socket !== next || typeof event.data !== 'string') return;
      try {
        const message = JSON.parse(event.data);
        if (message?.type === 'context.changed') onChanged?.(message);
      } catch {}
    });
    next.addEventListener('close', () => {
      if (socket === next) socket = null;
      onDisconnected?.();
      scheduleReconnect();
    });
    next.addEventListener('error', () => {
      try { next.close(); } catch {}
    });
  }

  function handleOnline() {
    connect();
  }

  function handleOffline() {
    clearRetry();
    const current = socket;
    socket = null;
    if (current) {
      try { current.close(1001, 'network offline'); } catch {}
    } else {
      onDisconnected?.();
    }
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
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    const current = socket;
    socket = null;
    if (current) {
      try { current.close(1000, 'player stopped'); } catch {}
    }
  }

  return Object.freeze({
    start,
    stop,
    get connected() { return socket?.readyState === WebSocket.OPEN; }
  });
}
