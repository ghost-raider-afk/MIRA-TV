import express from 'express';
import { positiveId } from '../../contracts/input.js';
import { parseReserveCode, parseScanPayload, tokenHash } from '../../services/device-session-service.js';
import { activity, conflict, notFound } from '../helpers.js';

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

export function createDeviceAdminRouter({ store }) {
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

  router.get('/bindings', async (_request, response) => {
    response.json(await store.listDeviceBindings());
  });

  router.delete('/bindings/:screenId', async (request, response) => {
    const screenId = positiveId(request.params.screenId, 'screen_id');
    const screen = await store.getScreen(screenId);
    if (!screen) throw notFound();
    const revoked = await store.revokeDeviceByScreen(screenId);
    if (revoked) {
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
