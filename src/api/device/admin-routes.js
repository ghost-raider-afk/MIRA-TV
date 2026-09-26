import crypto from 'node:crypto';
import express from 'express';
import { positiveId } from '../../contracts/input.js';
import { parseReserveCode, parseScanPayload, tokenHash } from '../../services/device-session-service.js';
import { activity, conflict, notFound } from '../helpers.js';

const PLAYER_CACHE_ACTIONS = new Set(['check', 'cleanup-unused', 'redownload-active']);

function activationId(value) {
  const id = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

function activationSummary(record) {
  return {
    activation_id: record.id,
    status: record.status,
    expires_at: record.expires_at,
    user_agent: record.user_agent || '',
    remote_address: record.remote_address || ''
  };
}

export function createDeviceAdminRouter({ store, realtime }) {
  const router = express.Router();

  router.post('/resolve', async (request, response) => {
    const scanToken = parseScanPayload(request.body?.scan_payload);
    const reserveCode = parseReserveCode(request.body?.reserve_code);
    if ((scanToken ? 1 : 0) + (reserveCode ? 1 : 0) !== 1) {
      return response.status(400).json({ error: 'Передайте QR-код или один 6-значный резервный код.' });
    }

    const activation = scanToken
      ? await store.getDeviceActivationByScanTokenHash(tokenHash(scanToken))
      : await store.getDeviceActivationByReserveCodeHash(tokenHash(reserveCode));
    if (!activation) throw notFound('Заявка подключения не найдена или уже истекла.');
    return response.json(activationSummary(activation));
  });

  router.post('/authorize', async (request, response) => {
    const id = activationId(request.body?.activation_id);
    if (!id) return response.status(400).json({ error: 'Некорректная заявка подключения.' });
    const screenId = positiveId(request.body?.screen_id, 'screen_id');
    const replaceExisting = request.body?.replace_existing === true;

    const result = await store.transaction(async (tx) => {
      const activation = await tx.getDeviceActivation(id, { lock: true });
      if (!activation) throw notFound('Заявка подключения не найдена.');
      if (Date.parse(activation.expires_at) <= Date.now()) throw conflict('Срок действия кода подключения истёк.');
      if (activation.status === 'consumed') throw conflict('Этот код уже использован для подключения телевизора.');
      if (activation.status === 'approved') {
        if (activation.approved_screen_id !== screenId) throw conflict('Этот код уже подтверждён для другого монитора.');
        return { activation, screen: await tx.getScreen(screenId), replacesExisting: false };
      }

      const screen = await tx.getScreen(screenId);
      if (!screen || screen.active === false) throw notFound('Активный монитор не найден.');

      const binding = await tx.getActiveDeviceBindingByScreen(screenId, { lock: true });
      const samePhysicalTv = binding && activation.device_key && binding.device_key === activation.device_key;
      if (binding && !samePhysicalTv && !replaceExisting) {
        throw conflict('К этому монитору уже подключён другой ТВ.', {
          reason: 'screen_already_bound',
          screen_id: screenId,
          screen_name: screen.name,
          current_tv_last_seen_at: binding.session_last_seen_at || binding.device_last_seen_at || null
        });
      }

      const approved = await tx.approveDeviceActivation(id, screenId, request.session.sub);
      if (!approved) throw conflict('Код подключения уже изменился или истёк.');
      return { activation: approved, screen, replacesExisting: Boolean(binding && !samePhysicalTv) };
    });

    if (!result.screen) throw notFound('Монитор не найден.');
    await activity(store, request, {
      action: result.replacesExisting ? 'device.reassigned' : 'device.authorized',
      entity_type: 'screen',
      entity_id: result.screen.id,
      message: result.replacesExisting
        ? `Подтверждена замена ТВ у монитора «${result.screen.name}».`
        : `Разрешено подключение телевизора к монитору «${result.screen.name}».`
    });
    return response.json({
      status: 'approved',
      activation_id: result.activation.id,
      replaces_existing: result.replacesExisting,
      screen: {
        id: result.screen.id,
        name: result.screen.name,
        location_id: result.screen.location_id,
        location_name: result.screen.location_name,
        location_number: result.screen.location_number
      }
    });
  });

  router.get('/bindings', async (request, response) => {
    const bindings = await store.listDeviceBindings();
    const deviceIds = bindings.map((binding) => binding.device_id);
    const [diagnostics, cacheStatuses] = await Promise.all([
      typeof store.listLatestPlayerLogsByDeviceIds === 'function'
        ? store.listLatestPlayerLogsByDeviceIds(deviceIds)
        : [],
      typeof store.listPlayerCacheStatusByDeviceIds === 'function'
        ? store.listPlayerCacheStatusByDeviceIds(deviceIds)
        : []
    ]);
    const diagnosticByDevice = new Map(diagnostics.map((entry) => [Number(entry.device_id), entry]));
    const cacheStatusByDevice = new Map(cacheStatuses.map((entry) => [Number(entry.device_id), entry]));
    const measurePing = request.query.measure_ping === '1';
    const pingResults = new Map();
    if (measurePing) {
      await Promise.all(bindings.map(async (binding) => {
        const value = await realtime?.pingScreen(binding.screen_id);
        pingResults.set(Number(binding.screen_id), Number.isFinite(value) ? value : null);
      }));
    }
    const measuredAt = measurePing ? new Date().toISOString() : null;
    response.json(bindings.map((binding) => {
      const presence = realtime?.presenceForScreen(binding.screen_id)
        || { online:false, connections:0, connected_at:null, realtime_last_seen_at:null };
      const preview = realtime?.screenPreviewMeta(binding.screen_id);
      const previewIsCurrentSession = Boolean(
        preview && (!presence.connected_at || Date.parse(preview.updated_at) >= Date.parse(presence.connected_at))
      );
      const measuredPing = measurePing ? pingResults.get(Number(binding.screen_id)) : null;
      const online = presence.online === true;
      return {
        ...binding,
        online,
        realtime_connections: presence.connections || 0,
        realtime_connected_at: presence.connected_at || null,
        realtime_last_seen_at: presence.realtime_last_seen_at || null,
        preview_available: online && previewIsCurrentSession,
        preview_updated_at: previewIsCurrentSession ? preview.updated_at : null,
        ping_ms: measurePing && Number.isFinite(measuredPing) ? measuredPing : null,
        ping_measured_at: measuredAt,
        player_diagnostic: diagnosticByDevice.get(Number(binding.device_id)) || null,
        cache_status: cacheStatusByDevice.get(Number(binding.device_id)) || null
      };
    }));
  });

  router.get('/bindings/:screenId/preview', async (request, response) => {
    const screenId = positiveId(request.params.screenId, 'screen_id');
    const binding = await store.getActiveDeviceBindingByScreen(screenId);
    if (!binding) throw notFound('Телевизор не подключён к этому монитору.');
    const presence = realtime?.presenceForScreen(screenId);
    if (presence?.online !== true) return response.status(404).json({ error: 'TV Player сейчас не в сети.' });
    const preview = realtime?.screenPreview(screenId);
    if (!preview) return response.status(404).json({ error: 'Кадр TV Player ещё не получен.' });
    response.setHeader('Cache-Control', 'private, no-cache');
    response.setHeader('ETag', preview.etag);
    if (request.get('if-none-match') === preview.etag) return response.status(304).end();
    response.type(preview.contentType);
    return response.send(preview.buffer);
  });


  router.post('/bindings/:screenId/cache-command', async (request, response) => {
    const screenId = positiveId(request.params.screenId, 'screen_id');
    const action = String(request.body?.action || '').trim();
    if (!PLAYER_CACHE_ACTIONS.has(action)) {
      return response.status(400).json({ error: 'Некорректная команда управления кэшем.' });
    }
    const screen = await store.getScreen(screenId);
    if (!screen) throw notFound('Монитор не найден.');
    const binding = await store.getActiveDeviceBindingByScreen(screenId);
    if (!binding) throw notFound('Телевизор не подключён к этому монитору.');
    const requestId = crypto.randomUUID();
    const sent = realtime?.sendCacheCommand(screenId, action, requestId) === true;
    if (!sent) return response.status(409).json({ error: 'TV Player сейчас не в сети.' });

    await activity(store, request, {
      action:'device.cache.command',
      entity_type:'screen',
      entity_id:screen.id,
      message:`Отправлена команда кэша «${action}» на монитор «${screen.name}».`,
      metadata:{ action, request_id:requestId }
    });
    return response.status(202).json({ accepted:true, request_id:requestId, action });
  });

  router.delete('/bindings/:screenId', async (request, response) => {
    const screenId = positiveId(request.params.screenId, 'screen_id');
    const screen = await store.getScreen(screenId);
    if (!screen) throw notFound();
    const revoked = await store.revokeDeviceByScreen(screenId);
    if (revoked) {
      realtime?.disconnectScreen(screenId);
      await activity(store, request, {
        action: 'device.revoked',
        entity_type: 'screen',
        entity_id: screen.id,
        message: `Отключён телевизор от монитора «${screen.name}».`
      });
    }
    response.status(204).end();
  });

  return router;
}
