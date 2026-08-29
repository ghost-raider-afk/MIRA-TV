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
  let heartbeatTimer = null;
  let attachedServer = null;

  function add(session, socket) {
    const screen = addToIndex(byScreen, session.screen_id, socket);
    const device = addToIndex(byDevice, session.device_id, socket);
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

  function disconnectScreen(screenId) {
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
          ws.on('pong', () => { ws.isAlive = true; });
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
    wss.close();
  }

  return Object.freeze({ attach, close, notifyScreen, notifyScreens, disconnectScreen, disconnectDevice });
}
