import express from 'express';
import { optionalText, positiveId } from '../../contracts/input.js';
import { managerUsernameInput } from '../../contracts/users.js';
import { notifyCatalogEntityChanged } from '../../services/catalog-render-notifier.js';
import { reviewCatalogChangeProposal } from '../../services/catalog-proposal-service.js';
import { hashPassword, validateNewPassword } from '../../services/password-service.js';
import { activity, conflict, notFound } from '../helpers.js';

const PROPOSAL_STATUSES = new Set(['pending','approved','rejected','conflict','resolved']);

function activeInput(value) {
  if (typeof value !== 'boolean') throw Object.assign(new Error('Поле active должно быть логическим значением.'), { status: 400 });
  return value;
}

function proposalStatus(value) {
  if (value === undefined || value === null || value === '') return null;
  const status = String(value);
  if (!PROPOSAL_STATUSES.has(status)) throw Object.assign(new Error('Статус заявки выбран неверно.'), { status:400 });
  return status;
}

async function reviewProposal({ store, realtime, request, response, decision }) {
  const id = positiveId(request.params.id, 'id');
  const reviewComment = optionalText(request.body?.comment, 'Комментарий', { max:500 });
  let result;
  try {
    result = await reviewCatalogChangeProposal(store, {
      proposalId:id,
      decision,
      reviewerUsername:request.session.sub,
      reviewComment
    });
  } catch (error) {
    if (error?.code === '23505') throw conflict('Предложенное название уже используется в каталоге.');
    throw error;
  }
  if (result.kind === 'missing') throw notFound('Заявка не найдена.');
  if (result.kind === 'resolved') throw conflict('Заявка уже обработана.', result.proposal);
  if (result.kind === 'conflict') {
    await activity(store, request, {
      action:'catalog.proposal.conflict',
      entity_type:'catalog_change_proposal',
      entity_id:id,
      message:`Заявка #${id} не применена: исходная запись каталога уже изменилась.`
    });
    return response.status(409).json({ error:'Исходная запись каталога уже изменилась. Создайте новое предложение.', proposal:result.proposal, current:result.entity });
  }
  if (result.kind === 'approved') {
    await notifyCatalogEntityChanged(
      store,
      realtime,
      result.proposal.entity_type,
      result.proposal.entity_id,
      'catalog.proposal.approved',
      request.session.sub
    );
  }
  await activity(store, request, {
    action:`catalog.proposal.${result.kind}`,
    entity_type:'catalog_change_proposal',
    entity_id:id,
    message:`Заявка #${id} ${result.kind === 'approved' ? 'утверждена' : result.kind === 'handled' ? 'обработана' : 'отклонена'}.`
  });
  return response.json(result);
}

export function createManagerAdminRouter({ store, config, realtime }) {
  const router = express.Router();

  router.get('/proposals', async (request, response) => {
    response.json(await store.listCatalogProposals({ status:proposalStatus(request.query?.status) }));
  });

  router.post('/proposals/:id/approve', async (request, response) => reviewProposal({ store, realtime, request, response, decision:'approve' }));
  router.post('/proposals/:id/reject', async (request, response) => reviewProposal({ store, realtime, request, response, decision:'reject' }));

  router.put('/:username/access', async (request, response) => {
    const username=managerUsernameInput(request.params.username);
    const { all_locations,catalog_enabled,location_ids }=request.body || {};
    if (typeof all_locations !== 'boolean' || typeof catalog_enabled !== 'boolean'
      || !Array.isArray(location_ids) || location_ids.length > 500
      || location_ids.some((id) => !Number.isSafeInteger(id) || id <= 0))
      return response.status(400).json({ error:'Некорректные права доступа менеджера.' });
    const ids=[...new Set(location_ids)];
    if (!all_locations) {
      const locations=await Promise.all(ids.map((id) => store.getLocation(id)));
      if (locations.some((location) => !location))
        return response.status(400).json({ error:'Торговая точка не найдена.' });
    }
    const access=await store.transaction((tx) => tx.setManagerAccess(username, {
      all_locations,catalog_enabled,location_ids:all_locations ? [] : ids
    }));
    if (!access) throw notFound('Менеджер не найден.');
    await activity(store,request,{
      action:'manager.access.updated',entity_type:'user',entity_id:username,
      message:`Права доступа менеджера «${username}» обновлены.`
    });
    response.json(access);
  });

  router.get('/', async (_request, response) => {
    response.json(await store.listManagers());
  });

  router.post('/', async (request, response) => {
    const username = managerUsernameInput(request.body?.username);
    const password = validateNewPassword(request.body?.password, config, 'Пароль менеджера');
    let manager;
    try {
      manager = await store.createManager({ username, passwordHash: await hashPassword(password) });
    } catch (error) {
      if (error?.code === '23505') throw conflict('Пользователь с таким логином уже существует.');
      throw error;
    }
    await activity(store, request, {
      action: 'manager.created',
      entity_type: 'user',
      entity_id: username,
      message: `Создан менеджер «${username}».`
    });
    response.status(201).json(manager);
  });

  router.put('/:username/password', async (request, response) => {
    const username = managerUsernameInput(request.params.username);
    const password = validateNewPassword(request.body?.password, config, 'Новый пароль менеджера');
    const manager = await store.updateManagerPassword(username, await hashPassword(password));
    if (!manager) throw notFound('Менеджер не найден.');
    await activity(store, request, {
      action: 'manager.password_updated',
      entity_type: 'user',
      entity_id: username,
      message: `Изменён пароль менеджера «${username}».`
    });
    response.json(manager);
  });

  router.put('/:username/active', async (request, response) => {
    const username = managerUsernameInput(request.params.username);
    const active = activeInput(request.body?.active);
    const manager = await store.setManagerActive(username, active);
    if (!manager) throw notFound('Менеджер не найден.');
    await activity(store, request, {
      action: active ? 'manager.activated' : 'manager.deactivated',
      entity_type: 'user',
      entity_id: username,
      message: `Менеджер «${username}» ${active ? 'активирован' : 'деактивирован'}.`
    });
    response.json(manager);
  });

  router.delete('/:username', async (request, response) => {
    const username = managerUsernameInput(request.params.username);
    if (!await store.deleteManager(username)) throw notFound('Менеджер не найден.');
    await activity(store, request, {
      action: 'manager.deleted',
      entity_type: 'user',
      entity_id: username,
      message: `Удалён менеджер «${username}».`
    });
    response.status(204).end();
  });

  return router;
}
