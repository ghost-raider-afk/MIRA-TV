import test from 'node:test';
import assert from 'node:assert/strict';
import { jsonValue } from '../src/db/helpers.js';
import {
  createCatalogChangeProposal,
  reviewCatalogChangeProposal
} from '../src/services/catalog-proposal-service.js';

function product(updatedAt = '2026-10-17T10:00:00.000Z') {
  return {
    id:1,
    name:'Пиво',
    producer:'Завод',
    address:'Адрес',
    characteristics:'светлое',
    strength:'4,5%',
    price_primary:'200',
    price_secondary:'300',
    alcoholic:true,
    beverage_color:'light',
    filtration:'filtered',
    active:true,
    updated_at:updatedAt
  };
}

function proposal(overrides = {}) {
  return {
    id:10,
    manager_username:'manager',
    entity_type:'product',
    entity_id:1,
    base_updated_at:'2026-10-17T10:00:00.000Z',
    base_payload:{ name:'Пиво', price_primary:'200' },
    proposed_payload:{
      name:'Пиво',
      producer:'Завод',
      address:'Адрес',
      characteristics:'светлое',
      strength:'4,5%',
      price_primary:'220',
      price_secondary:'330',
      alcoholic:true,
      beverage_color:'light',
      filtration:'filtered',
      active:true
    },
    status:'pending',
    review_comment:'',
    ...overrides
  };
}

function reviewStore({ current = product(), currentProposal = proposal() } = {}) {
  const calls = { updates:0, resolves:[], locks:[] };
  const store = {
    calls,
    current,
    currentProposal,
    async transaction(run) { return run(this); },
    async getCatalogProposalForUpdate() { return this.currentProposal; },
    async getProduct() { return this.current; },
    async getProductForUpdate() { calls.locks.push('product'); return this.current; },
    async getPackaging() { return null; },
    async getPackagingForUpdate() { calls.locks.push('packaging'); return null; },
    async updateProduct(id, payload) {
      calls.updates += 1;
      this.current = { ...this.current, ...payload, id, updated_at:'2026-10-17T10:05:00.000Z' };
      return this.current;
    },
    async updatePackaging() { throw new Error('unexpected packaging update'); },
    async resolveCatalogProposal(id, resolution) {
      calls.resolves.push({ id, ...resolution });
      this.currentProposal = { ...this.currentProposal, ...resolution };
      return this.currentProposal;
    }
  };
  return store;
}

test('manager proposal snapshots current catalog and normalises proposed product data', async () => {
  let created;
  const current = product();
  const store = {
    async getProduct(id) { return id === 1 ? current : null; },
    async getPackaging() { return null; },
    async createCatalogProposal(input) {
      created = input;
      return { id:10, status:'pending', ...input };
    }
  };

  const result = await createCatalogChangeProposal(store, {
    managerUsername:'manager',
    entityType:'product',
    entityId:1,
    proposedPayload:{ ...current, price_primary:'220' }
  });

  assert.equal(result.status, 'pending');
  assert.equal(created.managerUsername, 'manager');
  assert.equal(created.baseUpdatedAt, current.updated_at);
  assert.equal(created.basePayload.price_primary, '200');
  assert.equal(created.proposedPayload.price_primary, '220');
  assert.equal(created.proposedPayload.price_secondary, '330');
});

test('administrator approval applies proposal through existing catalog update then marks it approved', async () => {
  const store = reviewStore();
  const result = await reviewCatalogChangeProposal(store, {
    proposalId:10,
    decision:'approve',
    reviewerUsername:'admin',
    reviewComment:'Принято'
  });

  assert.equal(result.kind, 'approved');
  assert.equal(store.calls.updates, 1);
  assert.deepEqual(store.calls.locks, ['product']);
  assert.equal(result.entity.price_primary, '220');
  assert.equal(result.entity.price_secondary, '330');
  assert.deepEqual(store.calls.resolves[0], {
    id:10,
    status:'approved',
    reviewerUsername:'admin',
    reviewComment:'Принято'
  });
});

test('administrator rejection never changes production catalog', async () => {
  const store = reviewStore();
  const result = await reviewCatalogChangeProposal(store, {
    proposalId:10,
    decision:'reject',
    reviewerUsername:'admin',
    reviewComment:'Не менять цену'
  });

  assert.equal(result.kind, 'rejected');
  assert.equal(store.calls.updates, 0);
  assert.equal(result.proposal.status, 'rejected');
});

test('stale proposal becomes conflict and cannot overwrite a newer catalog value', async () => {
  const store = reviewStore({ current:product('2026-10-17T10:02:00.000Z') });
  const result = await reviewCatalogChangeProposal(store, {
    proposalId:10,
    decision:'approve',
    reviewerUsername:'admin'
  });

  assert.equal(result.kind, 'conflict');
  assert.equal(store.calls.updates, 0);
  assert.equal(result.proposal.status, 'conflict');
  assert.equal(store.current.price_primary, '200');
});

test('catalog edit in the same millisecond conflicts instead of overwriting the newer price', async () => {
  const store = reviewStore({ current:{ ...product(), price_primary:'205' } });
  const result = await reviewCatalogChangeProposal(store, {
    proposalId:10, decision:'approve', reviewerUsername:'admin'
  });
  assert.equal(result.kind, 'conflict');
  assert.deepEqual(store.calls.locks, ['product']);
  assert.equal(store.calls.updates, 0);
  assert.equal(store.current.price_primary, '205');
});

test('PostgreSQL JSONB snapshots stay intact after decoding instead of becoming empty proposals', () => {
  const payload = { name:'Пиво', price_primary:'200', active:true };
  assert.deepEqual(jsonValue(payload, {}), payload);
  assert.deepEqual(jsonValue(JSON.stringify(payload), {}), payload);
  assert.deepEqual(jsonValue([payload], []), [payload]);
  assert.deepEqual(jsonValue('invalid json', {}), {});
});

test('message cards resolve without updating catalog values', async () => {
  const store=reviewStore({ currentProposal:proposal({
    entity_type:'message', entity_id:null, base_updated_at:null,
    base_payload:{}, proposed_payload:{}, title:'Проверить ТВ',
    description:'В торговой точке не совпадает название'
  }) });
  const result=await reviewCatalogChangeProposal(store,{
    proposalId:10, decision:'approve', reviewerUsername:'admin', reviewComment:'Исправили'
  });
  assert.equal(result.kind,'handled');
  assert.equal(result.proposal.status,'resolved');
  assert.equal(store.calls.updates,0);
  assert.deepEqual(store.calls.locks,[]);
});
