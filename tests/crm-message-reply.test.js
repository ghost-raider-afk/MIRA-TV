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
