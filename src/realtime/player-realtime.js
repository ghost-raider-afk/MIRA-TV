import { WebSocket, WebSocketServer } from 'ws';
import { deviceSessionTokenFromRequest, tokenHash } from '../services/device-session-service.js';

const HEARTBEAT_MS = 60_000;

function safeClose(socket, code, reason) {
  try { socket.close(code, reason); } catch {}
}

function addToIndex(index, key, socket) {
  const id = Number(key);
  let sockets = index.get(id);
  if (!sockets) {
    sockets = new Set();
    index.set(id, sockets);
  }
  sockets.add(socket);
  return { id, sockets };
}

function disconnectIndexed(index, key, reason) {
  const sockets = index.get(Number(key));
  if (!sockets) return 0;
  const count = sockets.size;
  for (const socket of [...sockets]) safeClose(socket, 4001, reason);
  return count;
}

export function createPlayerRealtime({ store }) {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 4096 });
  const byScreen = new Map();
  const byDevice = new Map();
  const screenPreviews = new Map();
  let heartbeatTimer = null;
  let attachedServer = null;

  function add(session, socket) {
    const screen = addToIndex(byScreen, session.screen_id, socket);
    const device = addToIndex(byDevice, session.device_id, socket);
    socket.miraConnectedAt = new Date().toISOString();
    socket.miraLastSeenAt = socket.miraConnectedAt;
    socket.once('close', () => {
      screen.sockets.delete(socket);
      if (screen.sockets.size === 0) byScreen.delete(screen.id);
      device.sockets.delete(socket);
      if (device.sockets.size === 0) byDevice.delete(device.id);
    });
  }

  function send(socket, payload) {
    if (socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(payload));
    return true;
  }

  function notifyScreen(screenId, revision = '') {
    const sockets = byScreen.get(Number(screenId));
    if (!sockets) return 0;
    let sent = 0;
    for (const socket of sockets) {
      if (send(socket, { type: 'context.changed', revision: String(revision || '') })) sent += 1;
    }
    return sent;
  }

  function notifyScreens(screenIds) {
    let sent = 0;
    for (const id of new Set((screenIds || []).map(Number).filter(Number.isSafeInteger))) sent += notifyScreen(id);
    return sent;
  }

  function presenceForScreen(screenId) {
    const sockets = byScreen.get(Number(screenId));
    const open = sockets ? [...sockets].filter((socket) => socket.readyState === WebSocket.OPEN) : [];
    return {
      online: open.length > 0,
      connections: open.length,
      connected_at: open.map((socket) => socket.miraConnectedAt).filter(Boolean).sort()[0] || null,
      realtime_last_seen_at: open.map((socket) => socket.miraLastSeenAt).filter(Boolean).sort().at(-1) || null
    };
  }

  function pingSocket(socket, timeoutMs) {
    if (socket?.readyState !== WebSocket.OPEN) return Promise.resolve(null);
    const payload = Buffer.from(`mira-ping:${Date.now()}:${Math.random().toString(36).slice(2)}`);
    const started = process.hrtime.bigint();
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.off('pong', onPong);
        resolve(value);
      };
      const onPong = (data) => {
        if (!Buffer.isBuffer(data) || !data.equals(payload)) return;
        socket.miraLastSeenAt = new Date().toISOString();
        const elapsed = Number(process.hrtime.bigint() - started) / 1_000_000;
        finish(Math.max(0, Math.round(elapsed)));
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      socket.on('pong', onPong);
      try { socket.ping(payload); } catch { finish(null); }
    });
  }

  async function pingScreen(screenId, timeoutMs = 2500, connectionGraceMs = 750) {
    const id = Number(screenId);
    const deadline = Date.now() + Math.max(250, Number(timeoutMs) || 2500);
    const graceDeadline = Math.min(deadline, Date.now() + Math.max(0, Number(connectionGraceMs) || 0));
    let sockets = [];

    do {
      sockets = [...(byScreen.get(id) || [])].filter((socket) => socket.readyState === WebSocket.OPEN);
      if (sockets.length || Date.now() >= graceDeadline) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    } while (Date.now() < graceDeadline);

    if (!sockets.length) return null;
    const remaining = Math.max(250, deadline - Date.now());
    const values = await Promise.all(sockets.map((socket) => pingSocket(socket, remaining)));
    const valid = values.filter((value) => Number.isFinite(value));
    return valid.length ? Math.min(...valid) : null;
  }

  function updateScreenPreview(screenId, buffer, contentType = 'image/webp') {
    const id = Number(screenId);
    if (!Number.isSafeInteger(id) || id < 1 || !Buffer.isBuffer(buffer) || buffer.length < 1) return null;
    const type = contentType === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    const updatedAt = new Date().toISOString();
    const preview = {
      buffer: Buffer.from(buffer),
      contentType: type,
      updatedAt,
      etag: `"tv-preview-${id}-${Date.now().toString(36)}"`
    };
    screenPreviews.set(id, preview);
    return { content_type:type, updated_at:updatedAt, etag:preview.etag, bytes:preview.buffer.length };
  }

  function screenPreview(screenId) {
    return screenPreviews.get(Number(screenId)) || null;
  }

  function screenPreviewMeta(screenId) {
    const preview = screenPreview(screenId);
    return preview ? {
      content_type: preview.contentType,
      updated_at: preview.updatedAt,
      etag: preview.etag,
      bytes: preview.buffer.length
    } : null;
  }

  function disconnectScreen(screenId) {
    screenPreviews.delete(Number(screenId));
    return disconnectIndexed(byScreen, screenId, 'binding revoked');
  }

  function disconnectDevice(deviceId) {
    return disconnectIndexed(byDevice, deviceId, 'device session replaced');
  }

  async function authenticate(request) {
    const token = deviceSessionTokenFromRequest(request);
    if (!token) return null;
    return store.getActiveDeviceSessionByHash(tokenHash(token));
  }

  function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(() => {
      for (const socket of wss.clients) {
        if (socket.isAlive === false) {
          socket.terminate();
          continue;
        }
        socket.isAlive = false;
        try { socket.ping(); } catch { socket.terminate(); }
      }
    }, HEARTBEAT_MS);
    heartbeatTimer.unref?.();
  }

  function attach(server) {
    if (attachedServer === server) return;
    if (attachedServer) throw new Error('MIRA-TV realtime hub is already attached to another HTTP server.');
    attachedServer = server;
    startHeartbeat();
    server.on('upgrade', async (request, socket, head) => {
      try {
        const url = new URL(request.url || '/', 'http://localhost');
        if (url.pathname !== '/ws/device') return;
        const session = await authenticate(request);
        if (!session) {
          socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
          socket.destroy();
          return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
          ws.isAlive = true;
          ws.on('pong', () => {
            ws.isAlive = true;
            ws.miraLastSeenAt = new Date().toISOString();
          });
          add(session, ws);
          send(ws, { type: 'ready', screen_id: session.screen_id });
        });
      } catch {
        socket.destroy();
      }
    });
  }

  function close() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    for (const socket of wss.clients) safeClose(socket, 1001, 'server stopping');
    byScreen.clear();
    byDevice.clear();
    screenPreviews.clear();
    wss.close();
  }

  return Object.freeze({
    attach,
    close,
    notifyScreen,
    notifyScreens,
    disconnectScreen,
    disconnectDevice,
    presenceForScreen,
    pingScreen,
    updateScreenPreview,
    screenPreview,
    screenPreviewMeta
  });
}
