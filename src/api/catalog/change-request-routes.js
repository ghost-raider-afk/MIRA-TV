import express from 'express';
import { optionalText, positiveId, requireText } from '../../contracts/input.js';
import {
  catalogEntitySnapshot,
  catalogProposalInput,
  getCatalogEntity,
  mergeCatalogProposal,
  notifyCatalogRevisions,
  updateCatalogEntityAndCollectRevisions
} from '../../services/catalog-change-service.js';
import { activity, conflict, notFound } from '../helpers.js';

async function enrich(store, item) {
  const current = item.entity_id ? await getCatalogEntity(store, item.entity_type, item.entity_id) : null;
  const currentSnapshot = catalogEntitySnapshot(item.entity_type, current);
  const comparison = currentSnapshot
    ? mergeCatalogProposal(item.entity_type, item.before, item.proposed, currentSnapshot)
    : { changedFields:[], conflictFields:['__missing__'], merged:null };
  return {
    ...item,
    current:currentSnapshot,
    changed_fields:comparison.changedFields,
    conflict_fields:comparison.conflictFields,
    has_conflict:comparison.conflictFields.length > 0
  };
}

export function createCatalogChangeRequestRouter({ store, realtime }) {
  const router = express.Router();

  router.get('/', async (request, response) => {
    const requestedStatus = String(request.query.status || 'open').trim().toLowerCase();
    const valid = new Set(['open', 'all', 'pending', 'conflict', 'approved', 'rejected']);
    const status = valid.has(requestedStatus) ? requestedStatus : 'open';
    let items = await store.listCatalogChangeRequests({ status:status === 'open' ? 'all' : status, limit:300 });
    if (status === 'open') items = items.filter((item) => item.status === 'pending' || item.status === 'conflict');
    response.json(await Promise.all(items.map((item) => enrich(store, item))));
  });

  router.post('/:id/approve', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const comment = optionalText(request.body?.comment, 'Комментарий', { max:1000 });
    const forceConflicts = request.body?.force_conflicts === true;

    let result;
    try {
      result = await store.transaction(async (tx) => {
        const item = await tx.getCatalogChangeRequestForUpdate(id);
        if (!item) throw notFound('Предложение изменения не найдено.');
        if (!['pending', 'conflict'].includes(item.status)) throw conflict('Это предложение уже обработано.');

        const current = item.entity_id ? await getCatalogEntity(tx, item.entity_type, item.entity_id) : null;
        if (!current) {
          const resolved = await tx.resolveCatalogChangeRequest(id, {
            status:'conflict',
            reviewerUsername:request.session.sub,
            reviewComment:comment || 'Исходная запись каталога больше не существует.'
          });
          return { conflict:true, request:resolved, current:null, conflictFields:['__missing__'], revisions:[] };
        }

        const currentSnapshot = catalogEntitySnapshot(item.entity_type, current);
        const comparison = mergeCatalogProposal(item.entity_type, item.before, item.proposed, currentSnapshot);
        if (comparison.conflictFields.length && !forceConflicts) {
          const resolved = item.status === 'conflict'
            ? item
            : await tx.resolveCatalogChangeRequest(id, {
                status:'conflict',
                reviewerUsername:request.session.sub,
                reviewComment:comment
              });
          return {
            conflict:true,
            request:resolved,
            current:currentSnapshot,
            conflictFields:comparison.conflictFields,
            revisions:[]
          };
        }

        const input = catalogProposalInput(item.entity_type, comparison.merged);
        const applied = await updateCatalogEntityAndCollectRevisions({
          store:tx,
          entityType:item.entity_type,
          id:item.entity_id,
          input,
          reason:`catalog.${item.entity_type}.approved`,
          actor:request.session.sub
        });
        if (!applied.entity) throw notFound('Запись каталога не найдена.');
        const resolved = await tx.resolveCatalogChangeRequest(id, {
          status:'approved',
          reviewerUsername:request.session.sub,
          reviewComment:comment
        });
        return { conflict:false, request:resolved, entity:applied.entity, revisions:applied.revisions };
      });
    } catch (error) {
      if (error?.code !== '23505') throw error;
      throw conflict('Предложенное изменение конфликтует с другой записью каталога.');
    }

    if (result.conflict) {
      return response.status(409).json({
        error:'Каталог изменился после создания предложения. Проверьте конфликтующие поля.',
        request:result.request,
        current:result.current,
        conflict_fields:result.conflictFields
      });
    }

    notifyCatalogRevisions(realtime, result.revisions);
    await activity(store, request, {
      action:'catalog.change.approved',
      entity_type:`catalog_${result.request.entity_type}`,
      entity_id:result.request.entity_id,
      message:`Изменение менеджера #${result.request.id} утверждено.`,
      metadata:{ requester_username:result.request.requester_username, comment }
    });
    response.json({ request:result.request, entity:result.entity });
  });

  router.post('/:id/reject', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const comment = requireText(request.body?.comment, 'Комментарий', { max:1000 });
    const resolved = await store.transaction(async (tx) => {
      const item = await tx.getCatalogChangeRequestForUpdate(id);
      if (!item) throw notFound('Предложение изменения не найдено.');
      if (!['pending', 'conflict'].includes(item.status)) throw conflict('Это предложение уже обработано.');
      return tx.resolveCatalogChangeRequest(id, {
        status:'rejected',
        reviewerUsername:request.session.sub,
        reviewComment:comment
      });
    });
    await activity(store, request, {
      action:'catalog.change.rejected',
      entity_type:`catalog_${resolved.entity_type}`,
      entity_id:resolved.entity_id,
      message:`Изменение менеджера #${resolved.id} отклонено.`,
      metadata:{ requester_username:resolved.requester_username, comment }
    });
    response.json(resolved);
  });

  return router;
}
