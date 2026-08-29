import { WebSocket, WebSocketServer } from 'ws';
import { deviceSessionTokenFromRequest, tokenHash } from '../services/device-session-service.js';

const HEARTBEAT_MS = 60_000;

function safeClose(socket, code, reason) {
  try { socket.close(code, reason); } catch {}
}

export function createPlayerRealtime({ store }) {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 4096 });
  const byScreen = new Map();
  let heartbeatTimer = null;
  let attachedServer = null;

  function add(screenId, socket) {
    const id = Number(screenId);
    let sockets = byScreen.get(id);
    if (!sockets) {
      sockets = new Set();
      byScreen.set(id, sockets);
    }
    sockets.add(socket);
    socket.once('close', () => {
      sockets.delete(socket);
      if (sockets.size === 0) byScreen.delete(id);
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
    const sockets = byScreen.get(Number(screenId));
    if (!sockets) return 0;
    const count = sockets.size;
    for (const socket of sockets) safeClose(socket, 4001, 'binding revoked');
    return count;
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
          add(session.screen_id, ws);
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
    wss.close();
  }

  return Object.freeze({ attach, close, notifyScreen, notifyScreens, disconnectScreen });
}
