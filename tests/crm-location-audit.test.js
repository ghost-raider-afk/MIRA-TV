import test from 'node:test';
import assert from 'node:assert/strict';
import { crmActivity } from '../src/shared/crm-activity.js';
import { requestLocationLabel, requestLocationList } from '../src/web/admin-ui/public/js/core/requests.js';
import { prepareWorkflowRequest } from '../src/services/crm-request-service.js';
import { createCatalogProposalsRepository } from '../src/db/catalog-proposals.js';

test('manual closure event is in Russian and never claims that menu was automatically changed',()=>{
  const proposal={id:6,request_type:'menu_add',entity_type:'request',items:[
    {name:'Лагер',producer:'Пивоварня',location_id:4,location_name:'Магазин Центральный'}
  ]};
  const event=crmActivity({proposal,action:'complete',actor:'supermanager'});
  assert.equal(event.message,
    'Заявка №6 «Добавить позиции в меню» завершена вручную администратором supermanager.');
  assert.match(event.details,/Торговая точка: Магазин Центральный/);
  assert.match(event.details,/Товар: Лагер \(Пивоварня\)/);
  assert.doesNotMatch(event.message+event.details,/crm\.request|complete|review/i);
});

test('review audit records each decision, prices and returned-position reason',()=>{
  const proposal={id:5,request_type:'price_change',entity_type:'request',
    items:[{key:1,name:'27 РЕГИОН',producer:'Завод',property:'price_primary',before:'230',value:'235',
      decision:'approved'}, {key:2,name:'Лагер',producer:'Завод',property:'price_primary',
      before:'200',value:'220',decision:'rework',comment:'Уточните изменение цены'}]};
  const record=crmActivity({proposal,action:'review',actor:'supermanager'});
  assert.match(record.message,/рассмотрена администратором supermanager/);
  assert.match(record.details,/Цена за 1 л: было 230,00 ₽ → станет 235,00 ₽/);
  assert.match(record.details,/Решение: Возвращено на доработку/);
  assert.match(record.details,/Замечание: Уточните изменение цены/);
});

test('new requests snapshot point names, while historical names are enriched in one DB query',async()=>{
  const product={id:5,name:'Лагер',producer:'Завод',active:true};
  let created;
  const tx={
    createWorkflowRequest:async(data)=>{created=data;return {id:7,...data};},
    recordProposalEvent:async()=>{}
  };
  const store={
    getProduct:async()=>product,
    getLocation:async()=>({id:4,name:'Магазин Центральный',active:true}),
    listScreens:async()=>[],
    transaction:async(fn)=>fn(tx)
  };
  const request=await prepareWorkflowRequest(store,{
    managerUsername:'manager',requestType:'menu_add',
    rawItems:[{product_id:5,location_id:4}],
    access:{catalog_enabled:true,all_locations:true,location_ids:[]}
  });
  assert.equal(request.items[0].location_name,'Магазин Центральный');
  const old={id:8,entity_type:'request',items_json:[
    {key:1,name:'Лагер',producer:'Завод',product_id:5,location_id:4}
  ]};
  const sql=[];
  const pool={query:async(query,values)=>{
    sql.push({query,values});
    if(query.startsWith('SELECT p.*'))return {rows:[old]};
    if(query.startsWith('SELECT id,name FROM locations'))return {rows:[{id:4,name:'Магазин Центральный'}]};
    throw new Error('unexpected SQL: '+query);
  }};
  const [enriched]=await createCatalogProposalsRepository(pool).listCatalogProposals({managerUsername:'manager'});
  assert.equal(sql.length,2);
  assert.equal(enriched.items[0].location_name,'Магазин Центральный');
  assert.equal(requestLocationLabel(enriched.items[0]),'Торговая точка: Магазин Центральный');
  assert.equal(requestLocationList({location_ids:[4,5],location_names:['Магазин Центральный','Магазин Южный']}),
    'Магазин Центральный, Магазин Южный');
});
