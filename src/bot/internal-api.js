import { timingSafeEqual, randomUUID } from 'node:crypto';
import express from 'express';
import { messengerIdentityId, messengerProvider } from './account-linking.js';

const COMMANDS = new Set(['start', 'help', 'status', 'requests']);

function tokenMatches(actual, expected) {
  if (!expected || typeof actual !== 'string' || !actual.startsWith('Bearer ')) return false;
  const left = Buffer.from(actual.slice(7));
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function screenName(screen) {
  const number = Number(screen.location_number);
  return number > 0 ? 'ТВ ' + number : String(screen.screen_name || 'Телевизор');
}

export function createBotInternalRouter({ store, realtime, token }) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) {
    throw new Error('BOT_INTERNAL_API_TOKEN must be 64 lowercase hexadecimal characters.');
  }
  const router = express.Router();
  router.use((request, response, next) => {
    response.setHeader('Cache-Control', 'private, no-store');
    if (!tokenMatches(request.get('authorization'), token)) return response.status(404).end();
    next();
  });

  router.post('/command', async (request, response) => {
    const provider = messengerProvider(request.body?.provider);
    const providerUserId = messengerIdentityId(request.body?.provider_user_id);
    const command = String(request.body?.command || '').toLowerCase();
    if (!COMMANDS.has(command)) return response.status(400).json({ error:'Неизвестная команда бота.' });
    const account = await store.resolveMessengerAccount(provider, providerUserId);
    if (!account) return response.status(403).json({ error:'Доступ к MIRA-TV не назначен администратором.' });

    if (command === 'start' || command === 'help') {
      return response.json({ text:'MIRA-TV · ' + account.username +
        '\n/status — состояние доступных ТВ\n/requests — последние уведомления о заявках\n/help — помощь' });
    }

    if (command === 'requests') {
      const result = await store.listRequestNotifications(account.username, { limit:8 });
      const rows = result.items || [];
      const lines = rows.map((item) =>
        '№' + item.proposal_id + ' · ' + String(item.title || 'Заявка').slice(0, 100) +
        (item.location_name ? ' · ' + String(item.location_name).slice(0, 80) : ''));
      return response.json({
        text:'Заявки · непрочитано: ' + Number(result.unread_count || 0) + '\n' +
          (lines.length ? lines.join('\n') : 'Уведомлений пока нет.')
      });
    }

    const bindings = await store.listDeviceBindings();
    const access = account.role === 'manager' ? await store.getManagerAccess(account.username) : null;
    const eligible = bindings.filter((binding) =>
      account.role === 'administrator' || (account.role === 'manager' &&
      (access?.all_locations === true || access?.location_ids?.includes(Number(binding.location_id)))));
    const offline = eligible.filter((binding) => !realtime?.presenceForScreen(binding.screen_id)?.online);
    const details = offline.slice(0, 15).map((binding) =>
      String(binding.location_name || 'Точка').slice(0, 80) + ' · ' + screenName(binding));
    return response.json({
      text:'Состояние ТВ: ' + (eligible.length - offline.length) + ' онлайн / ' + offline.length + ' офлайн' +
        (details.length ? '\nНет связи:\n' + details.join('\n') : '') +
        (offline.length > details.length ? '\n… и ещё ' + (offline.length-details.length) : '')
    });
  });
  router.post('/jobs/claim', async (_request, response) => {
    const result = await store.transaction(async (tx) => {
      for (const binding of await tx.listDeviceBindings()) {
        await tx.stageTvIncident(binding, realtime?.presenceForScreen(binding.screen_id)?.online === true);
      }
      const leaseToken = randomUUID();
      const jobs = await tx.claimBotJobs(leaseToken);
      return { lease_token:leaseToken, jobs };
    });
    response.json(result);
  });

  router.post('/jobs/:id/complete', async (request, response) => {
    if (typeof request.body?.success !== 'boolean') return response.status(400).json({ error:'Invalid delivery result.' });
    const id=Number(request.params.id);
    if (!Number.isSafeInteger(id) || id<1 || typeof request.body?.lease_token!=='string') {
      return response.status(400).json({ error:'Invalid delivery receipt.' });
    }
    const ok=await store.completeBotJob(id,request.body.lease_token,request.body.success);
    response.status(ok ? 200 : 409).json({ accepted:ok });
  });
  return router;
}
