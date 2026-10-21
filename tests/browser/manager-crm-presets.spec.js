import { test, expect } from '@playwright/test';

const baseURL=process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';
const adminPassword=process.env.E2E_ADMIN_PASSWORD || '';
test.skip(!adminPassword,'E2E_ADMIN_PASSWORD is required');

async function login(page,username,password,path) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill(username);
  await page.getByLabel('Пароль').fill(password);
  await Promise.all([
    page.waitForURL(url=>url.pathname===path),
    page.getByRole('button',{name:/войти/i}).click()
  ]);
}
async function json(response,expected=200) {
  expect(response.status()).toBe(expected);
  return response.json();
}

test('presets #2-#5 keep catalog writes atomic and manual requests separate from TV editor',async({browser})=>{
  const admin=await browser.newContext({baseURL});
  const manager=await browser.newContext({baseURL});
  const a=await admin.newPage();
  const m=await manager.newPage();
  const stamp=Date.now();
  const username='workflow_'+stamp;
  const password='Workflow-'+stamp+'-A1!';
  let locationId=null;
  const productIds=[];
  try {
    await login(a,'admin',adminPassword,'/');
    await json(await a.request.post('/api/admin/managers',{data:{username,password}}),201);
    const location=await json(await a.request.post('/api/locations',{
      data:{name:'CRM Preset '+stamp,address:'Test',active:true}
    }),201);
    locationId=location.id;
    const screen1=await json(await a.request.post('/api/locations/'+locationId+'/screens',{data:{}}),201);
    const screen2=await json(await a.request.post('/api/locations/'+locationId+'/screens',{data:{}}),201);
    for(const name of ['Лагер '+stamp,'Сидр '+stamp]) {
      const item=await json(await a.request.post('/api/catalog/products',{data:{
        name,producer:'Тестовая пивоварня',address:'Тестовый адрес',
        characteristics:'',strength:'4,5%',price_primary:'200',
        alcoholic:true,beverage_color:'light',filtration:'filtered',active:true
      }}),201);
      productIds.push(item.id);
    }
    await json(await a.request.put('/api/admin/managers/'+username+'/access',{
      data:{all_locations:true,catalog_enabled:true,location_ids:[]}
    }));
    await login(m,username,password,'/manager');

    // #2: one product, two different properties; both changes are committed together.
    const properties=await json(await m.request.post('/api/manager/proposals/request',{data:{
      request_type:'property_change',
      items:[
        {product_id:productIds[0],property:'strength',value:'5%'},
        {product_id:productIds[0],property:'filtration',value:'unfiltered'}
      ]
    }}),201);
    const approved=await json(await a.request.post('/api/admin/managers/proposals/'+properties.id+'/workflow',{data:{
      action:'review',decisions:[{key:1,decision:'approved'},{key:2,decision:'approved'}]
    }}));
    expect(approved.proposal.status).toBe('approved');
    const catalog=await json(await a.request.get('/api/catalog/products'));
    const changed=catalog.find(item=>item.id===productIds[0]);
    expect(changed).toMatchObject({strength:'5%',filtration:'unfiltered'});

    // #3: informational only. Completing the request never adds a line to either TV.
    const addition=await json(await m.request.post('/api/manager/proposals/request',{data:{
      request_type:'menu_add',
      items:[{product_id:productIds[1],location_id:locationId}]
    }}),201);
    const before1=await json(await a.request.get('/api/screens/'+screen1.id+'/editor'));
    const before2=await json(await a.request.get('/api/screens/'+screen2.id+'/editor'));
    await json(await a.request.post('/api/admin/managers/proposals/'+addition.id+'/workflow',{
      data:{action:'complete'}
    }));
    const afterAdd1=await json(await a.request.get('/api/screens/'+screen1.id+'/editor'));
    const afterAdd2=await json(await a.request.get('/api/screens/'+screen2.id+'/editor'));
    expect(afterAdd1.draft).toEqual(before1.draft);
    expect(afterAdd2.draft).toEqual(before2.draft);

    // #4: one new product is saved once; placement on screens happens manually afterward.
    const newcomer=await json(await m.request.post('/api/manager/proposals/request',{data:{
      request_type:'product_create',
      items:[{location_ids:[locationId],payload:{
        name:'Пшеничное '+stamp,producer:'Новая пивоварня',address:'Хабаровск',
        price_primary:'220',strength:'4,8%',filtration:'unfiltered',
        beverage_color:'white',alcoholic:true,active:true
      }}]
    }}),201);
    const saved=await json(await a.request.post('/api/admin/managers/proposals/'+newcomer.id+'/workflow',{
      data:{action:'save_product'}
    }));
    expect(saved.product.id).toBeTruthy();
    productIds.push(saved.product.id);
    expect(saved.proposal.status).toBe('pending');
    const again=await json(await a.request.post('/api/admin/managers/proposals/'+newcomer.id+'/workflow',{
      data:{action:'save_product'}
    }));
    expect(again.product.id).toBe(saved.product.id);
    const completed=await json(await a.request.post('/api/admin/managers/proposals/'+newcomer.id+'/workflow',{
      data:{action:'complete'}
    }));
    expect(completed.status).toBe('approved');
    const noAuto1=await json(await a.request.get('/api/screens/'+screen1.id+'/editor'));
    expect(noAuto1.draft).toEqual(before1.draft);

    // #5: prepare existing canonical drafts as the normal editor does.
    const initial={background_color:'#102030'};
    async function publish(screen,id,rowId) {
      const editor=await json(await a.request.get('/api/screens/'+screen.id+'/editor'));
      const saved=await json(await a.request.put('/api/screens/'+screen.id+'/draft',{data:{
        revision:editor.draft.revision,
        rows:[
          {id:'section-'+rowId,kind:'section',name:'РАЗЛИВНОЕ',enabled:true,column:'left'},
          {id:rowId,kind:'item',product_id:id,enabled:true,column:'left'}
        ],
        settings:{...editor.draft.settings,...initial},
        screen:{
          location_id:screen.location_id,name:screen.name,resolution:screen.resolution,
          status:'published',active:true,template_id:null
        }
      }}));
      expect(saved.screen.status).toBe('published');
      return saved.draft;
    }
    const first=await publish(screen1,productIds[0],'beer-one');
    const second=await publish(screen2,productIds[1],'beer-two');
    const removal=await json(await m.request.post('/api/manager/proposals/request',{data:{
      request_type:'menu_remove',
      items:[
        {screen_id:screen1.id,row_id:'beer-one'},
        {screen_id:screen2.id,row_id:'beer-two'}
      ]
    }}),201);
    const removed=await json(await a.request.post('/api/admin/managers/proposals/'+removal.id+'/workflow',{data:{
      action:'review',decisions:[{key:1,decision:'approved'},{key:2,decision:'approved'}]
    }}));
    expect(removed.proposal.status).toBe('approved');
    for(const [screen,old] of [[screen1,first],[screen2,second]]) {
      const editor=await json(await a.request.get('/api/screens/'+screen.id+'/editor'));
      expect(editor.draft.rows).toHaveLength(1);
      expect(editor.draft.rows[0].kind).toBe('section');
      expect(editor.draft.settings).toEqual(old.settings);
      expect(editor.draft.scene).toEqual(old.scene);
      expect(editor.draft.revision).toBeGreaterThan(old.revision);
    }
    const remaining=await json(await a.request.get('/api/catalog/products'));
    for(const id of productIds)expect(remaining.some(item=>item.id===id)).toBeTruthy();
  } finally {
    if(locationId)await a.request.delete('/api/locations/'+locationId).catch(()=>undefined);
    for(const id of productIds)await a.request.delete('/api/catalog/products/'+id).catch(()=>undefined);
    await a.request.delete('/api/admin/managers/'+username).catch(()=>undefined);
    await manager.close();
    await admin.close();
  }
});
