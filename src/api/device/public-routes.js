import crypto from 'node:crypto';
import express from 'express';
import { createIpRateLimiter } from '../../middleware/ip-rate-limiter.js';
import { createActivationQrSvg } from '../../services/qr-code-service.js';
import {
  createActivationCredentials,
  deterministicDeviceSessionToken,
  deviceSessionCookie,
  deviceSessionTokenFromRequest,
  remoteAddress,
  tokenHash,
  userAgent
} from '../../services/device-session-service.js';
import { buildPlayerState, deltaPlayerContext, fullPlayerContext } from '../../services/player-context-service.js';

const PLAYER_COMPONENTS = new Set(['screen', 'menu', 'animation', 'environment', 'scene_playlist', 'entity', 'brand', 'announcement', 'scene', 'runtime']);
const LOG_LEVELS = new Set(['info', 'warn', 'error']);

function activationId(value) {
  const id = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

function activationSecret(request) {
  const value = request.get('x-device-activation-secret');
  return typeof value === 'string' && value.length >= 32 && value.length <= 128 ? value : null;
}

function persistentDeviceKey(value) {
  const key = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{16,128}$/.test(key) ? key : null;
}

function publicScreen(session) {
  return {
    id: session.screen_id,
    name: session.screen_name,
    resolution: session.resolution,
    status: session.screen_status,
    location_id: session.location_id,
    location_name: session.location_name,
    location_number: session.location_number
  };
}

function knownPlayerState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { schema_version: 0, hashes: {} };
  const schemaVersion = Number(value.schema_version);
  const hashes = {};
  if (value.hashes && typeof value.hashes === 'object' && !Array.isArray(value.hashes)) {
    for (const [name, hash] of Object.entries(value.hashes)) {
      if (PLAYER_COMPONENTS.has(name) && typeof hash === 'string' && /^[A-Za-z0-9_-]{20,128}$/.test(hash)) hashes[name] = hash;
    }
  }
  return { schema_version: Number.isSafeInteger(schemaVersion) ? schemaVersion : 0, hashes };
}

function playerLogBatch(value, config) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('Некорректный пакет журнала Player.'), { status: 400 });
  const bootId = String(value.boot_id || '').trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(bootId)) throw Object.assign(new Error('Некорректный boot_id Player.'), { status: 400 });
  if (!Array.isArray(value.events) || value.events.length < 1 || value.events.length > config.playerLogBatchSize) {
    throw Object.assign(new Error(`Пакет журнала должен содержать от 1 до ${config.playerLogBatchSize} событий.`), { status: 400 });
  }
  const events = value.events.map((event) => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw Object.assign(new Error('Некорректное событие Player.'), { status: 400 });
    const seq = Number(event.seq);
    const level = String(event.level || 'info');
    const type = String(event.type || '').trim();
    const revision = String(event.revision || '').slice(0, 128);
    const deviceTimestamp = String(event.device_timestamp || '').trim();
    const data = event.data && typeof event.data === 'object' && !Array.isArray(event.data) ? event.data : {};
    if (!Number.isSafeInteger(seq) || seq < 1) throw Object.assign(new Error('Некорректная последовательность события Player.'), { status: 400 });
    if (!LOG_LEVELS.has(level)) throw Object.assign(new Error('Некорректный уровень события Player.'), { status: 400 });
    if (!/^[a-z0-9._-]{1,64}$/i.test(type)) throw Object.assign(new Error('Некорректный тип события Player.'), { status: 400 });
    if (deviceTimestamp && !Number.isFinite(Date.parse(deviceTimestamp))) throw Object.assign(new Error('Некорректное время события Player.'), { status: 400 });
    if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 512) throw Object.assign(new Error('Метаданные события Player слишком велики.'), { status: 413 });
    return { seq, level, type, revision, device_timestamp: deviceTimestamp || null, data };
  });
  return { bootId, events };
}

async function createPendingActivation(store, config, request) {
  const expiresAt = new Date(Date.now() + config.deviceActivationTtlMinutes * 60_000).toISOString();
  const deviceKey = persistentDeviceKey(request.body?.device_key) || crypto.randomUUID();
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const credentials = createActivationCredentials();
    try {
      await store.createDeviceActivation({
        id: credentials.id,
        deviceKey,
        scanTokenHash: tokenHash(credentials.scanToken),
        pollSecretHash: tokenHash(credentials.pollSecret),
        reserveCodeHash: tokenHash(credentials.reserveCode),
        expiresAt,
        userAgent: userAgent(request),
        remoteAddress: remoteAddress(request)
      });
      return { credentials, expiresAt, deviceKey };
    } catch (error) {
      lastError = error;
      if (error?.code !== '23505') throw error;
    }
  }
  throw lastError || new Error('Не удалось создать уникальный код подключения телевизора.');
}

async function resolveDeviceSession(store, config, request, response) {
  const rawToken = deviceSessionTokenFromRequest(request);
  if (!rawToken) return null;
  const session = await store.getActiveDeviceSessionByHash(tokenHash(rawToken));
  if (!session) {
    response.setHeader('Set-Cookie', deviceSessionCookie('', config, 0));
    return null;
  }

  const now = Date.now();
  const staleBeforeMs = now - config.deviceHeartbeatWriteSeconds * 1000;
  const lastSeenMs = Date.parse(session.session_last_seen_at || '');
  if (!Number.isFinite(lastSeenMs) || lastSeenMs < staleBeforeMs) {
    await store.touchDeviceSession(
      session.session_id,
      session.device_id,
      new Date(now).toISOString(),
      new Date(staleBeforeMs).toISOString()
    );
  }
  return session;
}

async function playerStateOrUnauthorized(store, config, request, response) {
  const session = await resolveDeviceSession(store, config, request, response);
  if (!session) return null;
  const state = await buildPlayerState(store, session, config);
  if (!state) {
    response.setHeader('Set-Cookie', deviceSessionCookie('', config, 0));
    return null;
  }
  return { session, state };
}

export function createDevicePublicRouter({ store, config, realtime }) {
  const router = express.Router();
  const activationLimiter = createIpRateLimiter({
    maxAttempts: config.deviceActivationMaxAttempts,
    windowMinutes: config.deviceActivationWindowMinutes,
    maxEntries: config.deviceActivationLimiterMaxEntries,
    message: 'Слишком много запросов на подключение ТВ. Повторите позже.'
  });

  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.post('/activations', activationLimiter, async (request, response) => {
    const { credentials, expiresAt, deviceKey } = await createPendingActivation(store, config, request);
    response.status(201).json({
      activation_id: credentials.id,
      device_key: deviceKey,
      qr_svg: createActivationQrSvg(credentials.scanToken),
      reserve_code: credentials.reserveCode,
      poll_secret: credentials.pollSecret,
      expires_at: expiresAt,
      poll_interval_ms: config.deviceActivationPollSeconds * 1000
    });
  });

  router.get('/activations/:id/status', async (request, response) => {
    const id = activationId(request.params.id);
    const secret = activationSecret(request);
    if (!id || !secret) return response.status(404).json({ error: 'Активация не найдена.' });

    const result = await store.transaction(async (tx) => {
      const activation = await tx.getDeviceActivationForPoll(id, tokenHash(secret), { lock: true });
      if (!activation) return { status: 'missing' };
      if (Date.parse(activation.expires_at) <= Date.now()) return { status: 'expired' };
      if (activation.status === 'pending') return { status: 'pending', expiresAt: activation.expires_at };

      const rawToken = deterministicDeviceSessionToken(activation.id, secret, config);
      const rawTokenHash = tokenHash(rawToken);

      if (activation.status === 'consumed') {
        const session = await tx.getActiveDeviceSessionByHash(rawTokenHash);
        if (!session) return { status: 'expired' };
        return { status: 'authorized', rawToken, session, bindingChanged: false };
      }

      if (activation.status !== 'approved' || !activation.approved_screen_id) return { status: 'expired' };
      const screen = await tx.getScreen(activation.approved_screen_id);
      if (!screen || screen.active === false) return { status: 'expired' };

      const device = await tx.bindDevice({
        deviceKey: persistentDeviceKey(activation.device_key) || activation.id,
        screenId: screen.id,
        label: screen.name,
        userAgent: activation.user_agent,
        remoteAddress: activation.remote_address,
        authorizedBy: activation.approved_by
      });
      const sessionId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + config.deviceSessionTtlDays * 86_400_000).toISOString();
      await tx.createDeviceSession({ id: sessionId, deviceId: device.id, tokenHash: rawTokenHash, expiresAt });
      const consumed = await tx.markDeviceActivationConsumed(activation.id, device.id, sessionId);
      if (!consumed) throw new Error('Не удалось завершить авторизацию телевизора.');
      const session = await tx.getActiveDeviceSessionByHash(rawTokenHash);
      if (!session) throw new Error('Созданная Device Session недоступна.');
      return {
        status: 'authorized',
        rawToken,
        session,
        bindingChanged: true,
        deviceId: device.id,
        screenId: screen.id
      };
    });

    if (result.status === 'missing') return response.status(404).json({ error: 'Активация не найдена.' });
    if (result.status === 'expired') return response.status(410).json({ status: 'expired' });
    if (result.status === 'pending') return response.json({ status: 'pending', expires_at: result.expiresAt });

    if (result.bindingChanged) {
      realtime?.disconnectDevice(result.deviceId);
      realtime?.disconnectScreen(result.screenId);
    }
    response.setHeader('Set-Cookie', deviceSessionCookie(result.rawToken, config));
    return response.json({ status: 'authorized', screen: publicScreen(result.session) });
  });

  router.get('/session', async (request, response) => {
    const session = await resolveDeviceSession(store, config, request, response);
    if (!session) return response.status(401).json({ authorized: false });
    return response.json({
      authorized: true,
      device_id: session.device_id,
      device_key: session.device_key,
      session_expires_at: session.expires_at,
      screen: publicScreen(session)
    });
  });

  router.get('/player-context', async (request, response) => {
    const resolved = await playerStateOrUnauthorized(store, config, request, response);
    if (!resolved) return response.status(401).json({ error: 'Телевизор не авторизован.' });
    const context = fullPlayerContext(resolved.state);
    const etag = `"${resolved.state.revision}"`;
    response.setHeader('Cache-Control', 'private, no-cache');
    response.setHeader('ETag', etag);
    if (request.get('if-none-match') === etag) return response.status(304).end();
    return response.json(context);
  });

  router.post('/player-delta', async (request, response) => {
    const resolved = await playerStateOrUnauthorized(store, config, request, response);
    if (!resolved) return response.status(401).json({ error: 'Телевизор не авторизован.' });
    response.setHeader('Cache-Control', 'private, no-store');
    return response.json(deltaPlayerContext(resolved.state, knownPlayerState(request.body)));
  });

  router.post('/player-logs', async (request, response) => {
    const session = await resolveDeviceSession(store, config, request, response);
    if (!session) return response.status(401).json({ error: 'Телевизор не авторизован.' });
    const batch = playerLogBatch(request.body, config);
    const acceptedThrough = await store.insertPlayerLogBatch(session.device_id, batch.bootId, batch.events);
    return response.status(202).json({ boot_id: batch.bootId, accepted_through: acceptedThrough });
  });

  return router;
}
