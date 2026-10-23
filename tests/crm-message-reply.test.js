import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewCatalogChangeProposal } from '../src/services/catalog-proposal-service.js';

function messageStore() {
  const calls = [];
  return {
    calls,
    async transaction(run) {
      return run({
        async getCatalogProposalForUpdate() {
          return { id:77, entity_type:'message', status:'pending' };
        },
        async resolveCatalogProposal(id, input) {
          calls.push({ id, ...input });
          return { id, entity_type:'message', status:input.status, review_comment:input.reviewComment };
        }
      });
    }
  };
}

test('administrator cannot complete general inquiry without a reply', async () => {
  const store = messageStore();
  for (const reviewComment of ['', '    ']) {
    await assert.rejects(
      reviewCatalogChangeProposal(store, {
        proposalId:77, decision:'approve', reviewerUsername:'admin', reviewComment
      }),
      (error) => error.status === 400 && /ответ менеджеру/i.test(error.message)
    );
  }
  assert.equal(store.calls.length, 0);
});

test('general inquiry is completed with the recorded administrator reply', async () => {
  const store = messageStore();
  const result = await reviewCatalogChangeProposal(store, {
    proposalId:77, decision:'approve', reviewerUsername:'admin',
    reviewComment:'Проверено, вопрос решён.'
  });
  assert.equal(result.kind, 'handled');
  assert.equal(result.proposal.status, 'resolved');
  assert.deepEqual(store.calls, [{
    id:77, status:'resolved', reviewerUsername:'admin', reviewComment:'Проверено, вопрос решён.'
  }]);
});

test('administrator can return message for rework only with a specific explanation',async()=>{
  const store=messageStore();
  await assert.rejects(reviewCatalogChangeProposal(store,{
    proposalId:77,decision:'rework',reviewerUsername:'admin',reviewComment:'коротко'
  }),error=>error.status===400);
  assert.equal(store.calls.length,0);
  const result=await reviewCatalogChangeProposal(store,{
    proposalId:77,decision:'rework',reviewerUsername:'admin',
    reviewComment:'Проверьте номер торговой точки.'
  });
  assert.equal(result.kind,'returned');
  assert.equal(result.proposal.status,'rework');
  assert.equal(store.calls[0].id,77);
});

test('message rework updates the same id and only a matching returned message',async()=>{
  const {createCatalogProposalsRepository}=await import('../src/db/catalog-proposals.js');
  const statements=[];
  const repo=createCatalogProposalsRepository({
    async query(sql,args) {
      statements.push({sql,args});
      return {rows:[{id:77,entity_type:'message',status:'pending',title:args?.[2]||'',base_payload:{},proposed_payload:{}}]};
    }
  });
  const updated=await repo.reviseMessageCard(77,{
    title:'Уточнение по ТВ',description:'Исправленное обращение',
    locationId:null,locationName:'',managerUsername:'manager'
  });
  assert.equal(updated.id,77);
  assert.match(statements[0].sql,/entity_type='message' AND status='rework'/);
  assert.deepEqual(statements[0].args,[77,'manager','Уточнение по ТВ','Исправленное обращение',null,'']);
  assert.match(statements[0].sql,/proposed_payload=jsonb_set/);
});
