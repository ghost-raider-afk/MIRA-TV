import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createManagerViewRouter } from '../src/api/managers/view-routes.js';

test('revoking catalog access does not hide manager-owned requests or replies', async (t) => {
  let query;
  const store = {
    async getManagerAccess() {
      return { catalog_enabled:false, all_locations:false, location_ids:[] };
    },
    async listCatalogProposals(filters) {
      query = filters;
      return [
        {id:31, entity_type:'request', request_type:'price_change', manager_username:'manager'},
        {id:32, entity_type:'message', manager_username:'manager', review_comment:'Проверено.'}
      ];
    }
  };
  const app = express();
  app.use((request,_response,next) => {
    request.session = { sub:'manager' };
    next();
  });
  app.use('/api/manager',createManagerViewRouter({store,config:{},weatherService:{}}));
  const server=app.listen(0);
  t.after(()=>new Promise((resolve)=>server.close(resolve)));
  await new Promise((resolve,reject)=>{
    if (server.listening) resolve();
    else {
      server.once('listening',resolve);
      server.once('error',reject);
    }
  });
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/manager/proposals');
  assert.equal(response.status,200);
  const rows=await response.json();
  assert.deepEqual(rows.map((row)=>row.id),[31,32]);
  assert.deepEqual(query,{managerUsername:'manager'});
});
