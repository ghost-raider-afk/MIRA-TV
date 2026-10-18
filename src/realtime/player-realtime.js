import { WebSocket, WebSocketServer } from 'ws';
import { deviceSessionTokenFromRequest, tokenHash } from '../services/device-session-service.js';

const HEARTBEAT_MS = 60_000;
const REPROVISION_TTL_MS = 10 * 60_000;

function safeClose(socket, code, reason) {
  try { socket.close(code, reason); } catch {}
}

function validCommandId(value) {
  const id = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : '';
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
  const forceRenderOnNextConnect = new Map();
  const previewOnNextConnect = new Set();
  const reprovisionByScreen = new Map();
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

  function pruneReprovision(screenId = null) {
    const now = Date.now();
    const entries = screenId === null
      ? [...reprovisionByScreen.entries()]
      : [[Number(screenId), reprovisionByScreen.get(Number(screenId))]];
    for (const [id, command] of entries) {
      if (!command) continue;
      if (now - command.requestedAtMs > REPROVISION_TTL_MS) reprovisionByScreen.delete(id);
    }
  }

  function notifyScreen(screenId, revision = '', { forceRender = false } = {}) {
    const id = Number(screenId);
    const revisionText = String(revision || '');
    if (forceRender && Number.isSafeInteger(id) && id > 0) previewOnNextConnect.add(id);
    const sockets = byScreen.get(id);
    if (!sockets) {
      if (forceRender && Number.isSafeInteger(id) && id > 0) forceRenderOnNextConnect.set(id, revisionText);
      return 0;
    }
    const payload = {
      type: 'context.changed',
      revision: revisionText,
      ...(forceRender ? { force_render:true } : {})
    };
    let sent = 0;
    for (const socket of sockets) {
      if (send(socket, payload)) sent += 1;
    }
    if (forceRender) {
      if (sent > 0) forceRenderOnNextConnect.delete(id);
      else forceRenderOnNextConnect.set(id, revisionText);
    }
    return sent;
  }

  function notifyScreens(screenIds) {
    let sent = 0;
    for (const id of new Set((screenIds || []).map(Number).filter(Number.isSafeInteger))) sent += notifyScreen(id);
    return sent;
  }

  function requestReprovision(screenId, revision = '', commandId = '') {
    const id = Number(screenId);
    const command = validCommandId(commandId);
    if (!Number.isSafeInteger(id) || id < 1 || !command) return null;
    const now = new Date();
    const state = {
      commandId: command,
      revision: String(revision || ''),
      requestedAt: now.toISOString(),
      requestedAtMs: now.getTime(),
      deliveredAt: null,
      acknowledgedAt: null,
      completedAt: null
    };
    reprovisionByScreen.set(id, state);
    previewOnNextConnect.add(id);
    const sockets = byScreen.get(id);
    let sent = 0;
    for (const socket of sockets || []) {
      if (send(socket, {
        type:'context.changed',
        revision:state.revision,
        force_reprovision:state.commandId
      })) sent += 1;
    }
    if (sent > 0) state.deliveredAt = new Date().toISOString();
    return { command_id:state.commandId, delivered:sent > 0, connections:sent };
  }

  function reprovisionStatus(screenId, commandId) {
    const id = Number(screenId);
    const command = validCommandId(commandId);
    pruneReprovision(id);
    const state = reprovisionByScreen.get(id);
    if (!state || state.commandId !== command) return null;
    return {
      command_id:state.commandId,
      revision:state.revision,
      status:state.completedAt ? 'completed' : state.acknowledgedAt ? 'acknowledged' : state.deliveredAt ? 'delivered' : 'pending',
      requested_at:state.requestedAt,
      delivered_at:state.deliveredAt,
      acknowledged_at:state.acknowledgedAt,
      completed_at:state.completedAt
    };
  }

  function acknowledgeReprovision(screenId, commandId) {
    const id = Number(screenId);
    const command = validCommandId(commandId);
    pruneReprovision(id);
    const state = reprovisionByScreen.get(id);
    if (!state || state.commandId !== command) return false;
    if (!state.acknowledgedAt) state.acknowledgedAt = new Date().toISOString();
    previewOnNextConnect.delete(id);
    requestScreenPreview(id);
    return true;
  }

  function requestScreenPreview(screenId) {
    const sockets = byScreen.get(Number(screenId));
    if (!sockets) return 0;
    let sent = 0;
    for (const socket of sockets) {
      if (send(socket, { type:'preview.request' })) sent += 1;
    }
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
    const reprovision = reprovisionByScreen.get(id);
    if (reprovision?.acknowledgedAt && !reprovision.completedAt) reprovision.completedAt = updatedAt;
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
      bytes:preview.buffer.length
    } : null;
  }

  function disconnectScreen(screenId) {
    const id = Number(screenId);
    screenPreviews.delete(id);
    forceRenderOnNextConnect.delete(id);
    previewOnNextConnect.delete(id);
    reprovisionByScreen.delete(id);
    return disconnectIndexed(byScreen, id, 'binding revoked');
  }

  function revokeScreen(screenId) {
    for (const socket of [...(byScreen.get(Number(screenId)) || { sockets:new Set() }).sockets]) {
      send(socket, { type:'device.revoked' });
    }
    return disconnectScreen(screenId);
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
      pruneReprovision();
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
          ws.on('message', (data, isBinary) => {
            if (isBinary) return;
            try {
              const message = JSON.parse(data.toString());
              if (message?.type === 'reprovision.ack') {
                acknowledgeReprovision(session.screen_id, message.command_id);
              }
            } catch {}
          });
          add(session, ws);
          send(ws, { type: 'ready', screen_id: session.screen_id });
          const screenId = Number(session.screen_id);
          pruneReprovision(screenId);
          const reprovision = reprovisionByScreen.get(screenId);
          if (reprovision && !reprovision.acknowledgedAt) {
            if (send(ws, {
              type:'context.changed',
              revision:reprovision.revision,
              force_reprovision:reprovision.commandId
            })) reprovision.deliveredAt = new Date().toISOString();
            return;
          }
          if (forceRenderOnNextConnect.has(screenId)) {
            const revision = forceRenderOnNextConnect.get(screenId) || '';
            forceRenderOnNextConnect.delete(screenId);
            if (!send(ws, { type:'context.changed', revision, force_render:true })) {
              forceRenderOnNextConnect.set(screenId, revision);
            }
            return;
          }
          const forcePreview = previewOnNextConnect.delete(screenId);
          if (forcePreview || !screenPreviews.has(screenId)) send(ws, { type:'preview.request' });
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
    forceRenderOnNextConnect.clear();
    previewOnNextConnect.clear();
    reprovisionByScreen.clear();
    wss.close();
  }

  return Object.freeze({
    attach,
    close,
    notifyScreen,
    notifyScreens,
    requestReprovision,
    reprovisionStatus,
    acknowledgeReprovision,
    requestScreenPreview,
    disconnectScreen,
    revokeScreen,
    disconnectDevice,
    presenceForScreen,
    pingScreen,
    updateScreenPreview,
    screenPreview,
    screenPreviewMeta
  });
}
