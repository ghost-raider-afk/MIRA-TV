import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareWorkflowRequest, reviewWorkflowRequest, saveNewProductFromRequest,
  completeManualRequest, reviseWorkflowRequest } from '../src/services/crm-request-service.js';

const product = Object.freeze({
  id:1,name:'Жигулёвское',producer:'Пивоварня',address:'',characteristics:'',strength:'4,5%',
  price_primary:'200',price_secondary:'300',alcoholic:true,
  beverage_color:'light',filtration:'filtered',active:true
});
function makeReviewStore(proposal, current=product) {
  const events=[];
  const writes=[];
  const tx={
    getCatalogProposalForUpdate:async()=>proposal,
    getProductForUpdate:async()=>current,
    getProduct:async()=>current,
    updateProduct:async(id,value)=>{writes.push({id,value});return value;},
    screensUsingCatalogIds:async()=>[],
    markScreenRenderChanged:async()=>[],
    updateWorkflowRequest:async(id,value)=>{proposal={...proposal,...value,items:value.items};return proposal;},
    recordProposalEvent:async(...args)=>{events.push(args);},
    getManagerAccess:async()=>({all_locations:true,catalog_enabled:true,location_ids:[]}),
    listScreens:async()=>[]
  };
  return {events,writes,tx,transaction:async(fn)=>fn(tx)};
}

test('returned price row does not modify product database', async()=>{
  const proposal={
    id:44,entity_type:'request',request_type:'price_change',status:'pending',
    items:[
      {key:1,product_id:1,name:product.name,property:'price_primary',before:'200',value:'230'},
      {key:2,product_id:1,name:product.name,property:'strength',before:'4,5%',value:'5%'}
    ]
  };
  const store=makeReviewStore(proposal);
  const result=await reviewWorkflowRequest(store,{
    proposalId:44,reviewerUsername:'admin',
    decisions:[
      {key:1,decision:'approved'},
      {key:2,decision:'rework',comment:'Проверь крепость по документам'}
    ]
  });
  assert.equal(result.proposal.status,'rework');
  assert.equal(store.writes.length,0);
  assert.equal(result.proposal.items[0].decision,'approved');
});

test('frozen approved row cannot be altered on subsequent review',async()=>{
  const proposal={
    id:44,entity_type:'request',request_type:'price_change',status:'pending',
    items:[
      {key:1,product_id:1,name:product.name,property:'price_primary',before:'200',value:'230',decision:'approved'},
      {key:2,product_id:1,name:product.name,property:'strength',before:'4,5%',value:'5%',decision:'pending'}
    ]
  };
  const store=makeReviewStore(proposal);
  await assert.rejects(reviewWorkflowRequest(store,{
    proposalId:44,reviewerUsername:'admin',
    decisions:[{key:1,decision:'rejected'},{key:2,decision:'approved'}]
  }),/Ранее рассмотренные/);
  assert.equal(store.writes.length,0);
});

test('one product with two properties is updated together at final confirmation',async()=>{
  const proposal={
    id:45,entity_type:'request',request_type:'property_change',status:'pending',
    items:[
      {key:1,product_id:1,name:product.name,property:'strength',before:'4,5%',value:'5%'},
      {key:2,product_id:1,name:product.name,property:'beverage_color',before:'light',value:'white'}
    ]
  };
  const store=makeReviewStore(proposal);
  const result=await reviewWorkflowRequest(store,{
    proposalId:45,reviewerUsername:'admin',
    decisions:[{key:1,decision:'approved'},{key:2,decision:'approved'}]
  });
  assert.equal(result.proposal.status,'approved');
  assert.equal(store.writes.length,1);
  assert.equal(store.writes[0].value.strength,'5%');
  assert.equal(store.writes[0].value.beverage_color,'white');
  assert.equal(store.writes[0].value.producer,'Пивоварня');
});

test('manager cannot revise approved lines',async()=>{
  const proposal={
    id:46,entity_type:'request',manager_username:'manager',status:'rework',
    request_type:'price_change',
    items:[
      {key:1,product_id:1,property:'price_primary',value:'230',decision:'approved'},
      {key:2,product_id:1,property:'strength',value:'5%',decision:'rework'}
    ]
  };
  const store=makeReviewStore(proposal);
  await assert.rejects(reviseWorkflowRequest(store,{
    proposalId:46,managerUsername:'manager',edits:[{key:1,value:'999'},{key:2,value:'6%'}]
  }),/Изменять согласованные/);
});

test('manual completion of a new product requires prior catalog save',async()=>{
  const proposal={
    id:47,entity_type:'request',request_type:'product_create',status:'pending',
    catalog_product_id:null,items:[{key:1,payload:product,location_ids:[1]}]
  };
  const store=makeReviewStore(proposal);
  await assert.rejects(completeManualRequest(store,{
    proposalId:47,reviewerUsername:'admin'
  }),/Сначала сохраните товар/);
  assert.equal(store.writes.length,0);
});

test('same product/property pair is rejected before proposal creation',async()=>{
  const store={
    getProduct:async()=>product,
    transaction:async()=>{throw new Error('Should not create proposal');}
  };
  await assert.rejects(prepareWorkflowRequest(store,{
    managerUsername:'manager',requestType:'property_change',
    access:{catalog_enabled:true,all_locations:true,location_ids:[]},
    rawItems:[{product_id:1,property:'strength',value:'5%'},{product_id:1,property:'strength',value:'6%'}]
  }),/дважды/);
});

test('published TV removal changes only the named row and preserves scene/settings',async()=>{
  const draft={
    revision:5,
    rows:[
      {id:'section',kind:'section',name:'РАЗЛИВНОЕ'},
      {id:'one',kind:'item',product_id:1,name:'Жигулёвское',enabled:true},
      {id:'two',kind:'item',product_id:2,name:'Лагер',enabled:true}
    ],
    settings:{theme:'custom',background_color:'#102030'},
    scene:{version:1,elements:[{id:'logo',type:'image'}]}
  };
  const writes=[];
  const tx={
    getCatalogProposalForUpdate:async()=>({
      id:50,entity_type:'request',status:'pending',request_type:'menu_remove',
      items:[{key:1,screen_id:8,row_id:'one',product_id:1,revision:5,decision:'pending'}]
    }),
    getScreen:async()=>({id:8,status:'published',active:true}),
    lockScreen:async()=>true,
    getScreenDraft:async()=>draft,
    saveScreenDraft:async(id,value,revision)=>{
      writes.push({id,value,revision});
      return {...value,revision:revision+1};
    },
    markScreenRenderChanged:async(ids,components)=>ids.map(screen_id=>({screen_id,revision:10,components})),
    updateWorkflowRequest:async(_id,value)=>({id:50,...value}),
    recordProposalEvent:async()=>{}
  };
  const result=await reviewWorkflowRequest({transaction:async(run)=>run(tx)},{
    proposalId:50,reviewerUsername:'admin',decisions:[{key:1,decision:'approved'}]
  });
  assert.equal(result.proposal.status,'approved');
  assert.equal(writes.length,1);
  assert.deepEqual(writes[0].value.rows.map(x=>x.id),['section','two']);
  assert.deepEqual(writes[0].value.settings,draft.settings);
  assert.deepEqual(writes[0].value.scene,draft.scene);
  assert.deepEqual(result.revisions,[{screen_id:8,revision:10,components:['menu']}]);
});

test('stale TV revision aborts removal before modifying the draft',async()=>{
  let writes=0;
  const tx={
    getCatalogProposalForUpdate:async()=>({
      id:51,entity_type:'request',status:'pending',request_type:'menu_remove',
      items:[{key:1,screen_id:8,row_id:'one',product_id:1,revision:4,decision:'pending'}]
    }),
    lockScreen:async()=>true,
    getScreen:async()=>({id:8,status:'published',active:true}),
    getScreenDraft:async()=>({revision:5,rows:[{id:'one',kind:'item',product_id:1}]}),
    saveScreenDraft:async()=>{writes++;return {};}
  };
  await assert.rejects(
    reviewWorkflowRequest({transaction:async(run)=>run(tx)},{
      proposalId:51,reviewerUsername:'admin',decisions:[{key:1,decision:'approved'}]
    }),
    (error)=>error.status===409 && /изменилось/i.test(error.message)
  );
  assert.equal(writes,0);
});

test('only published TVs can become removal request targets',async()=>{
  const tx={
    listScreens:async()=>[{id:7,location_id:3,status:'draft',active:true}],
    getScreenDraft:async()=>({revision:5,rows:[{id:'line',kind:'item',product_id:1,name:'Жигулёвское'}]})
  };
  await assert.rejects(
    prepareWorkflowRequest(tx,{
      managerUsername:'manager',requestType:'menu_remove',
      access:{catalog_enabled:true,all_locations:true,location_ids:[]},
      rawItems:[{screen_id:7,row_id:'line'}]
    }),
    /опубликованного ТВ/
  );
});
