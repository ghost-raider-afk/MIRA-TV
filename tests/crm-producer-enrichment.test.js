import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogProposalsRepository } from '../src/db/catalog-proposals.js';

test('historical request manufacturers are loaded once without catalog route access',async()=>{
  const queries=[];
  const db={
    async query(sql,values){
      queries.push({sql,values});
      if (sql.startsWith('SELECT p.*')) return {rows:[
        {id:1,entity_type:'request',status:'pending',
          items_json:[{key:1,name:'27 РЕГИОН',product_id:7},{key:2,name:'Лагер',product_id:8}]},
        {id:2,entity_type:'request',status:'approved',
          items_json:[{key:1,name:'27 РЕГИОН',product_id:7}]}
      ]};
      if (sql.startsWith('SELECT id,name,producer FROM catalog_products')) return {rows:[
        {id:7,name:'27 РЕГИОН',producer:'Пивоварня Амур'},
        {id:8,name:'Лагер',producer:'Другой завод'}
      ]};
      throw new Error('Unexpected SQL');
    }
  };
  const proposals=await createCatalogProposalsRepository(db).listCatalogProposals({managerUsername:'manager'});
  assert.equal(queries.length,2);
  assert.deepEqual(queries[1].values,[[7,8]]);
  assert.equal(proposals[0].items[0].producer,'Пивоварня Амур');
  assert.equal(proposals[0].items[1].producer,'Другой завод');
  assert.equal(proposals[1].items[0].producer,'Пивоварня Амур');
});

test('stored manufacturers remain immutable and avoid additional catalog queries',async()=>{
  let calls=0;
  const db={async query(){calls++;return {rows:[
    {id:1,entity_type:'request',items_json:[
      {key:1,name:'27 РЕГИОН',producer:'Исторический производитель',product_id:7}
    ]}
  ]};}};
  const proposals=await createCatalogProposalsRepository(db).listCatalogProposals({managerUsername:'manager'});
  assert.equal(calls,1);
  assert.equal(proposals[0].items[0].producer,'Исторический производитель');
});
