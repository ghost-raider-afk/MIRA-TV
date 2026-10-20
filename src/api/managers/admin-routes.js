import express from 'express';
import { optionalText, positiveId } from '../../contracts/input.js';
import { managerDisplayNameInput, managerUsernameInput } from '../../contracts/users.js';
import { notifyCatalogEntityChanged } from '../../services/catalog-render-notifier.js';
import { reviewCatalogChangeProposal } from '../../services/catalog-proposal-service.js';
import { reviewWorkflowRequest, completeManualRequest, saveNewProductFromRequest, returnOrRejectWorkflowRequest } from '../../services/crm-request-service.js';
import { hashPassword, validateNewPassword } from '../../services/password-service.js';
import { activity, conflict, notFound } from '../helpers.js';

const PROPOSAL_STATUSES = new Set(['pending','rework','approved','rejected','conflict','resolved','history']);

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
    message:`Заявка #${id} ${result.kind === 'approved' ? 'утверждена' : result.kind === 'handled' ? 'обработана' : result.kind === 'returned' ? 'возвращена на доработку' : 'отклонена'}.`
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
  router.post('/proposals/:id/rework', async (request,response) => {
    const id=positiveId(request.params.id,'id');
    const proposal=await store.getCatalogProposal(id);
    if (!proposal || proposal.entity_type !== 'message') throw notFound('Обращение не найдено.');
    return reviewProposal({store,realtime,request,response,decision:'rework'});
  });


  router.get('/proposals/:id/history', async (request,response) => {
    const id = positiveId(request.params.id,'id');
    if (!await store.getCatalogProposal(id)) throw notFound('Заявка не найдена.');
    response.json(await store.listProposalEvents(id));
  });

  router.post('/proposals/:id/workflow', async (request,response) => {
    const proposalId = positiveId(request.params.id,'id');
    const reviewerUsername = request.session.sub;
    const action = String(request.body?.action || '');
    let result;
    if (action === 'review') {
      result = await reviewWorkflowRequest(store,{
        proposalId,reviewerUsername,decisions:request.body?.decisions
      });
      for (const item of result.revisions || []) realtime?.notifyScreen(item.screen_id,item.revision);
    } else if (action === 'save_product') {
      result = await saveNewProductFromRequest(store,{
        proposalId,reviewerUsername,correctedPayload:request.body?.product
      });
    } else if (action === 'complete') {
      result = await completeManualRequest(store,{proposalId,reviewerUsername});
    } else if (action === 'rework' || action === 'rejected') {
      result = await returnOrRejectWorkflowRequest(store,{
        proposalId,reviewerUsername,action,
        comment:optionalText(request.body?.comment,'Комментарий',{max:2000})
      });
    } else {
      return response.status(400).json({error:'Неизвестное действие с заявкой.'});
    }
    await activity(store,request,{
      action:'crm.request.'+action,entity_type:'catalog_change_proposal',entity_id:proposalId,
      message:'Обработка заявки №'+proposalId+': '+action+'.'
    });
    response.json(result);
  });

  router.delete('/proposals/:id', async (request,response) => {
    const id = positiveId(request.params.id,'id');
    const removed = await store.transaction(async (tx) => {
      const proposal = await tx.getCatalogProposalForUpdate(id);
      if (!proposal) return false;
      await tx.recordProposalEvent(id,request.session.sub,'deleted',{status:proposal.status});
      return tx.deleteProposal(id);
    });
    if (!removed) throw notFound('Заявка не найдена.');
    response.status(204).end();
  });

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
    const displayName = request.body?.display_name == null || request.body.display_name === ''
      ? username : managerDisplayNameInput(request.body.display_name);
    const password = validateNewPassword(request.body?.password, config, 'Пароль менеджера');
    let manager;
    try {
      const passwordHash = await hashPassword(password);
      manager = await store.transaction((tx) => tx.createManager({ username, passwordHash, displayName }));
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

  router.put('/:username/name', async (request, response) => {
    const username=managerUsernameInput(request.params.username);
    const displayName=managerDisplayNameInput(request.body?.display_name);
    const updated=await store.setManagerDisplayName(username, displayName);
    if (!updated) throw notFound('Менеджер не найден.');
    await activity(store,request,{
      action:'manager.display_name_updated',entity_type:'user',entity_id:username,
      message:`Обновлено имя менеджера «${username}».`
    });
    response.json(updated);
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
