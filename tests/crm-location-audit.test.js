import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareWorkflowRequest } from '../src/services/crm-request-service.js';
import { describeCrmActivity } from '../src/services/crm-activity-description.js';
import { journalEventMessage, journalActionLabel } from '../src/web/admin-ui/public/js/core/journal-presentation.js';
import { requestLocationDetails } from '../src/web/admin-ui/public/js/core/requests.js';
import { createCatalogProposalsRepository } from '../src/db/catalog-proposals.js';

const product={id:11,name:'НЕМЕЦКОЕ',producer:'ОАО Барнаульский пивоваренный завод',
  active:true,price_primary:'230',strength:'5%',filtration:'filtered'};
function proposalStore() {
  let created=null;
  return {
    listScreens:async()=>[],
    getProduct:async()=>product,
    getLocation:async(id)=>({id,name:id===4?'Центральный магазин':'Северная точка',active:true}),
    transaction:async(fn)=>fn({
      createWorkflowRequest:async ({items,requestType,description})=>{
        created={id:6,entity_type:'request',request_type:requestType,
          items,description,status:'pending'};
        return created;
      },
      recordProposalEvent:async()=>{}
    })
  };
}
test('manager selects location ID but new request stores a stable name snapshot',async()=>{
  const store=proposalStore();
  const proposal=await prepareWorkflowRequest(store,{
    managerUsername:'manager',requestType:'menu_add',access:{catalog_enabled:true,all_locations:true,location_ids:[]},
    rawItems:[{product_id:11,location_id:4}]
  });
  assert.equal(proposal.items[0].location_id,4);
  assert.equal(proposal.items[0].location_name,'Центральный магазин');
  assert.equal(requestLocationDetails(proposal.items[0]),'Торговая точка: Центральный магазин');
});

test('new product request details list actual locations, never numeric trading-point IDs',()=>{
  const item={payload:{name:'НЕМЕЦКОЕ',producer:'ОАО Барнаульский пивоваренный завод'},
    location_ids:[4,8],location_names:{4:'Центральный магазин',8:'Северная точка'}};
  assert.equal(requestLocationDetails(item),'Торговые точки: Центральный магазин, Северная точка');
});

test('legacy requests resolve missing names by one local query without changing snapshots',async()=>{
  const sql=[];
  const repository=createCatalogProposalsRepository({
    async query(query,args) {
      sql.push({query,args});
      if(query.startsWith('SELECT p.*')) return {rows:[
        {id:5,entity_type:'request',items_json:[
          {key:1,location_id:4,location_name:'Историческое название'},
          {key:2,location_ids:[4,8],location_names:{4:'Историческое название'}}
        ],base_payload:{},proposed_payload:{}}
      ]};
      if(query.startsWith('SELECT id,name FROM locations')) return {rows:[
        {id:8,name:'Северная точка'}
      ]};
      throw new Error('Unexpected SQL: '+query);
    }
  });
  const [proposal]=await repository.listCatalogProposals();
  assert.deepEqual(sql[1].args,[[8]]);
  assert.equal(proposal.items[0].location_name,'Историческое название');
  assert.deepEqual(proposal.items[1].location_names,{4:'Историческое название',8:'Северная точка'});
});

test('existing location-only workflow items get a name without changing the database',async()=>{
  const repo=createCatalogProposalsRepository({
    async query(sql,args) {
      if(sql.startsWith('SELECT *')) return {rows:[{id:6,entity_type:'request',
        base_payload:{},proposed_payload:{},
        items_json:[{key:1,location_id:4,product_id:null}]}]};
      if(sql.startsWith('SELECT id,name FROM locations')) {
        assert.deepEqual(args,[[4]]);
        return {rows:[{id:4,name:'Центральный магазин'}]};
      }
      throw new Error('Unexpected SQL: '+sql);
    }
  });
  const proposal=await repo.getCatalogProposal(6);
  assert.equal(proposal.items[0].location_name,'Центральный магазин');
});

test('manual completion reports explicitly that the administrator closed the request',()=>{
  const result=describeCrmActivity({
    id:6,request_type:'menu_add',items:[{name:'НЕМЕЦКОЕ',producer:product.producer,
      location_id:4,location_name:'Центральный магазин'}]
  },'complete');
  assert.match(result.message,/Заявка №6 «Добавить позиции в меню» закрыта вручную администратором/);
  assert.match(result.details,/Товар: НЕМЕЦКОЕ \(ОАО Барнаульский пивоваренный завод\)/);
  assert.match(result.details,/Торговая точка: Центральный магазин/);
  assert.doesNotMatch(result.message,/complete|crm\.request/);
});

test('review audit includes decisions, changed values and location names in Russian',()=>{
  const result=describeCrmActivity({
    id:5,request_type:'menu_remove',items:[
      {name:'НЕМЕЦКОЕ',producer:product.producer,location_name:'Центральный магазин',
        location_id:4,screen_id:7,decision:'approved'},
      {name:'ЛАГЕР',location_name:'Северная точка',location_id:8,screen_id:9,
        decision:'rework',comment:'Уточните позицию меню'}
    ]
  },'review');
  assert.match(result.message,/согласовано — 1, на доработку — 1, отклонено — 0/);
  assert.match(result.details,/Торговая точка: Центральный магазин/);
  assert.match(result.details,/Решение: Согласовано/);
  assert.match(result.details,/Решение: На доработку/);
  assert.match(result.details,/Замечание: Уточните позицию меню/);
});

test('historical system events are localized without changing their stored audit codes',()=>{
  assert.equal(journalEventMessage({
    action:'crm.request.complete',message:'Обработка заявки №6: complete.'
  }),'Заявка №6 закрыта вручную администратором.');
  assert.equal(journalEventMessage({
    action:'crm.request.review',message:'Обработка заявки №5: review.'
  }),'Администратор рассмотрел заявку №5.');
  assert.equal(journalActionLabel({action:'crm.request.review'}),'');
  assert.equal(journalActionLabel({action:'catalog.proposal.handled'}),'');
  assert.equal(journalActionLabel({action:'screen.update'}),'Действие: screen.update');
});
