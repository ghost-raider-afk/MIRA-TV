import { packagingInput, productInput } from '../contracts/input.js';

const ENTITY_TYPES = new Set(['product', 'packaging']);

function timestampMs(value) {
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function requireEntityType(value) {
  const type = String(value || '');
  if (!ENTITY_TYPES.has(type)) throw Object.assign(new Error('Тип записи каталога не поддерживается.'), { status:400 });
  return type;
}

function productPayload(entity) {
  return {
    name:entity.name || '',
    producer:entity.producer || '',
    address:entity.address || '',
    characteristics:entity.characteristics || '',
    strength:entity.strength || '',
    price_primary:entity.price_primary || '',
    price_secondary:entity.price_secondary || '',
    alcoholic:entity.alcoholic === true,
    beverage_color:entity.beverage_color || 'none',
    filtration:entity.filtration || 'none',
    active:entity.active !== false
  };
}

function packagingPayload(entity) {
  return {
    name:entity.name || '',
    unit_price:entity.unit_price || '',
    active:entity.active !== false
  };
}

export function catalogEntityPayload(entityType, entity) {
  if (!entity) return null;
  return requireEntityType(entityType) === 'product' ? productPayload(entity) : packagingPayload(entity);
}

function normaliseProposalPayload(entityType, payload) {
  return entityType === 'product' ? productInput(payload || {}) : packagingInput(payload || {});
}

async function currentEntity(store, entityType, entityId, { forUpdate = false } = {}) {
  if (entityType === 'product') return forUpdate ? store.getProductForUpdate(entityId) : store.getProduct(entityId);
  return forUpdate ? store.getPackagingForUpdate(entityId) : store.getPackaging(entityId);
}

async function updateEntity(store, entityType, entityId, payload) {
  return entityType === 'product'
    ? store.updateProduct(entityId, payload)
    : store.updatePackaging(entityId, payload);
}

export async function createCatalogChangeProposal(store, { managerUsername, entityType, entityId, proposedPayload, description = '' }) {
  const type = requireEntityType(entityType);
  const current = await currentEntity(store, type, entityId);
  if (!current) return null;
  const proposed = normaliseProposalPayload(type, proposedPayload);
  return store.createCatalogProposal({
    managerUsername,
    entityType:type,
    entityId,
    baseUpdatedAt:current.updated_at,
    basePayload:catalogEntityPayload(type, current),
    proposedPayload:proposed,
    description
  });
}

export async function reviewCatalogChangeProposal(store, { proposalId, decision, reviewerUsername, reviewComment = '' }) {
  const status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : decision === 'rework' ? 'rework' : null;
  if (!status) throw Object.assign(new Error('Решение по заявке не поддерживается.'), { status:400 });

  return store.transaction(async (tx) => {
    const proposal = await tx.getCatalogProposalForUpdate(proposalId);
    if (!proposal) return { kind:'missing', proposal:null, entity:null };
    if (proposal.status !== 'pending') return { kind:'resolved', proposal, entity:null };

    if (status === 'rework') {
      const note = String(reviewComment || '').trim();
      if (proposal.entity_type !== 'message') {
        throw Object.assign(new Error('Возврат этой заявки обрабатывается через пресет.'), { status:400 });
      }
      if (note.length < 10) {
        throw Object.assign(new Error('Комментарий для доработки должен содержать минимум 10 символов.'), { status:400 });
      }
      const returned = await tx.resolveCatalogProposal(proposalId, {
        status:'rework',reviewerUsername,reviewComment:note
      });
      if (typeof tx.recordProposalEvent === 'function') {
        await tx.recordProposalEvent(proposalId,reviewerUsername,'returned',{comment:note});
      }
      return { kind:'returned', proposal:returned, entity:null };
    }

    if (proposal.entity_type === 'message' && status === 'approved') {
      if (!String(reviewComment || '').trim()) {
        throw Object.assign(new Error('Напишите ответ менеджеру перед завершением заявки.'), { status:400 });
      }
      const handled = await tx.resolveCatalogProposal(proposalId, {
        status:'resolved', reviewerUsername, reviewComment
      });
      if (typeof tx.recordProposalEvent === 'function') {
        await tx.recordProposalEvent(proposalId,reviewerUsername,'completed',{reply:reviewComment});
      }
      return { kind:'handled', proposal:handled, entity:null };
    }

    if (status === 'rejected') {
      const resolved = await tx.resolveCatalogProposal(proposalId, {
        status:'rejected', reviewerUsername, reviewComment
      });
      if (proposal.entity_type === 'message' && typeof tx.recordProposalEvent === 'function') {
        await tx.recordProposalEvent(proposalId,reviewerUsername,'rejected',{comment:reviewComment});
      }
      return { kind:'rejected', proposal:resolved, entity:null };
    }

    const current = await currentEntity(tx, proposal.entity_type, proposal.entity_id, { forUpdate:true });
    const baseTime = timestampMs(proposal.base_updated_at);
    const currentTime = timestampMs(current?.updated_at);
    if (!current || !Number.isFinite(baseTime) || !Number.isFinite(currentTime) || baseTime !== currentTime
      || Object.entries(proposal.base_payload || {}).some(([key, value]) =>
        JSON.stringify(catalogEntityPayload(proposal.entity_type, current)?.[key]) !== JSON.stringify(value))) {
      const conflict = await tx.resolveCatalogProposal(proposalId, {
        status:'conflict', reviewerUsername, reviewComment
      });
      return { kind:'conflict', proposal:conflict, entity:current || null };
    }

    const payload = normaliseProposalPayload(proposal.entity_type, proposal.proposed_payload);
    const updated = await updateEntity(tx, proposal.entity_type, proposal.entity_id, payload);
    if (!updated) {
      const conflict = await tx.resolveCatalogProposal(proposalId, {
        status:'conflict', reviewerUsername, reviewComment
      });
      return { kind:'conflict', proposal:conflict, entity:null };
    }
    const approved = await tx.resolveCatalogProposal(proposalId, {
      status:'approved', reviewerUsername, reviewComment
    });
    return { kind:'approved', proposal:approved, entity:updated };
  });
}
