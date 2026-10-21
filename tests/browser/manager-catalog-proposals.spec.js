import { test, expect } from '@playwright/test';

const baseURL=process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';
const adminPassword=process.env.E2E_ADMIN_PASSWORD || '';
test.skip(!adminPassword, 'E2E_ADMIN_PASSWORD is required for the manager workflow test');

async function login(page,username,password,expectedPath) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill(username);
  await page.getByLabel('Пароль').fill(password);
  await Promise.all([
    page.waitForURL((url)=>url.pathname===expectedPath),
    page.getByRole('button',{name:/войти/i}).click()
  ]);
}
async function openTab(page,key) {
  await page.locator('.app-header-nav-link[data-header-section="'+key+'"]').click();
}
async function openOtherInquiry(page) {
  await openTab(page,'manager-requests');
  await page.locator('#manager-create-request').click();
  const message=page.locator('#manager-message-dialog');
  const preset=page.locator('#manager-crm-dialog');
  if (!await message.isVisible()) {
    await expect(preset).toBeVisible();
    await preset.locator('#crm-preset').selectOption('message');
  }
  await expect(message).toBeVisible();
  await expect(preset).not.toBeVisible();
}
async function expectJournalStatus(row,label) {
  const badge=row.locator('.request-journal-status');
  await expect(badge).toHaveText(label);
  const geometry=await badge.evaluate((element)=>{
    const rect=element.getBoundingClientRect();
    const parent=element.closest('.request-journal-row').getBoundingClientRect();
    const style=getComputedStyle(element);
    return {
      size:style.fontSize,weight:parseInt(style.fontWeight,10),
      paddingTop:style.paddingTop,paddingBottom:style.paddingBottom,
      overflow:rect.right>parent.right+1,lines:rect.height/parseFloat(style.lineHeight)
    };
  });
  expect(geometry.weight).toBeGreaterThanOrEqual(700);
  expect(geometry.overflow).toBe(false);
  expect(geometry.lines).toBeLessThan(3);
  return geometry;
}

test('canonical TV preview, price request, administrator reply and permissions use shared CRM journal',async({browser})=>{
  const adminContext=await browser.newContext({baseURL});
  const managerContext=await browser.newContext({baseURL});
  const adminPage=await adminContext.newPage();
  const managerPage=await managerContext.newPage();
  const stamp=Date.now();
  const username='manager_'+stamp;
  const password='Manager-'+stamp+'-Aa1!';
  let locationId=null;
  let productId=null;
  try {
    await login(adminPage,'admin',adminPassword,'/');
    const user=await adminPage.request.post('/api/admin/managers',{data:{username,password}});
    expect(user.status()).toBe(201);
    const productResponse=await adminPage.request.post('/api/catalog/products',{data:{
      name:'Менеджер E2E '+stamp,producer:'Тестовый завод',address:'',
      characteristics:'светлое',strength:'4,5%',price_primary:'200',
      alcoholic:true,beverage_color:'light',filtration:'filtered',active:true
    }});
    expect(productResponse.status()).toBe(201);
    productId=(await productResponse.json()).id;
    const loc=await adminPage.request.post('/api/locations',{
      data:{name:'Manager E2E '+stamp,address:'',active:true}
    });
    expect(loc.status()).toBe(201);
    locationId=(await loc.json()).id;
    const screenResp=await adminPage.request.post('/api/locations/'+locationId+'/screens',{data:{}});
    expect(screenResp.status()).toBe(201);
    const screen=await screenResp.json();
    const grant=await adminPage.request.put('/api/admin/managers/'+username+'/access',{
      data:{all_locations:true,catalog_enabled:true,location_ids:[]}
    });
    expect(grant.ok()).toBeTruthy();
    await login(managerPage,username,password,'/manager');

    const group=managerPage.locator('.manager-location').filter({hasText:'Manager E2E '+stamp});
    await group.locator('.manager-location-toggle').click();
    const screenCard=managerPage.locator('[data-manager-screen-id="'+screen.id+'"]');
    await expect(screenCard).toBeVisible();
    await expect(screenCard.locator('.manager-screen-stage svg.menu-table-svg')).toHaveCount(1,{timeout:5000});
    await expect(screenCard.locator('.manager-screen-stage img')).toHaveCount(0);

    for (const width of [320,360,390,430,768]) {
      await managerPage.setViewportSize({width,height:844});
      const sizing=await managerPage.evaluate(()=>({
        width:document.documentElement.clientWidth,
        document:document.documentElement.scrollWidth,
        body:document.body.scrollWidth
      }));
      expect(sizing.document,'manager overflow at '+width).toBeLessThanOrEqual(sizing.width+1);
      expect(sizing.body,'manager body overflow at '+width).toBeLessThanOrEqual(sizing.width+1);
      await openOtherInquiry(managerPage);
      const modal=managerPage.locator('#manager-message-dialog');
      const box=await modal.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x+box.width).toBeLessThanOrEqual(width+1);
      await modal.getByRole('button',{name:'Отмена'}).click();
      await expect(modal).not.toBeVisible();
    }
    await managerPage.setViewportSize({width:1280,height:720});

    await openTab(managerPage,'manager-catalog');
    const productRow=managerPage.locator('.manager-catalog-row',{hasText:'Менеджер E2E '+stamp});
    await expect(productRow).toBeVisible();
    const search=managerPage.getByRole('searchbox',{name:'Поиск по названию или производителю'});
    await search.fill('Менеджер E2E '+stamp);
    await expect(productRow).toBeVisible();
    await search.fill('тестовый завод');
    await expect(productRow).toBeVisible();
    await search.fill('');

    await openTab(managerPage,'manager-requests');
    await managerPage.locator('#manager-create-request').click();
    const create=managerPage.locator('#manager-crm-dialog');
    await expect(create).toBeVisible();
    await create.locator('#crm-preset').selectOption('price_change');
    await create.locator('[name="product_id"]').first().selectOption(String(productId));
    await create.locator('[name="value"]').first().fill('220');
    const pricePosted=managerPage.waitForResponse((response)=>
      response.url().endsWith('/api/manager/proposals/request') && response.request().method()==='POST'
    );
    await create.getByRole('button',{name:'Отправить заявку'}).click();
    const postedPrice=await pricePosted;
    expect(postedPrice.status()).toBe(201);
    const priceId=(await postedPrice.json()).id;
    await expect(create).not.toBeVisible();
    await openTab(managerPage,'manager-requests');
    const priceRow=managerPage.locator('.request-journal-row[aria-label^="Заявка №'+priceId+'."]');
    await expect(priceRow).toBeVisible();
    const pendingStyle=await expectJournalStatus(priceRow,'На рассмотрении');
    await priceRow.click();
    const managerDetail=managerPage.locator('#manager-request-detail');
    await expect(managerDetail).toBeVisible();
    await expect(managerDetail).toContainText('Менеджер E2E '+stamp);
    await expect(managerDetail).toContainText('200');
    await expect(managerDetail).toContainText('220');
    await managerDetail.getByRole('button',{name:'Закрыть'}).click();

    await adminPage.goto('/catalog');
    await openTab(adminPage,'approvals');
    await expect(adminPage).toHaveURL(/\/approvals$/);
    await expect(adminPage.locator('main #catalog-approval-dialog')).toHaveCount(1);
    const incomingPrice=adminPage.locator('.request-journal-row[aria-label^="Заявка №'+priceId+'."]');
    await expectJournalStatus(incomingPrice,'На рассмотрении');
    await incomingPrice.click();
    const adminDialog=adminPage.locator('#catalog-approval-dialog');
    await expect(adminDialog).toBeVisible();
    await expect(adminDialog.locator('#catalog-approval-title')).toHaveText('Изменить цену');
    await expect(adminDialog).toContainText('Менеджер E2E '+stamp);
    await expect(adminDialog).toContainText('200');
    await expect(adminDialog).toContainText('220');
    const diff=adminDialog.locator('.catalog-approval-diff-row').first();
    await expect(diff.locator('small')).toHaveText(['Было','Стало']);
    const colors=await diff.evaluate((row)=>{
      const probe=document.createElement('span');
      row.append(probe);
      probe.style.color='var(--ui-danger)';
      const danger=getComputedStyle(probe).color;
      probe.style.color='var(--ui-success)';
      const success=getComputedStyle(probe).color;
      probe.remove();
      const before=row.querySelector('.catalog-approval-before');
      const after=row.querySelector('.catalog-approval-after');
      return {
        danger,success,oldColor:getComputedStyle(before).color,
        newColor:getComputedStyle(after).color,
        oldDecoration:getComputedStyle(before).textDecorationLine,
        newDecoration:getComputedStyle(after).textDecorationLine
      };
    });
    expect(colors.oldColor).toBe(colors.danger);
    expect(colors.newColor).toBe(colors.success);
    expect(colors.oldDecoration).toBe('line-through');
    expect(colors.newDecoration).toBe('none');
    await adminDialog.locator('.crm-workflow-controls select').selectOption('approved');
    adminPage.once('dialog',(dialog)=>dialog.accept());
    await adminDialog.getByRole('button',{name:'Проверить и применить'}).click();
    await expect(adminDialog).not.toBeVisible();

    const catalog=await (await adminPage.request.get('/api/catalog/products')).json();
    const updated=catalog.find((item)=>Number(item.id)===Number(productId));
    expect(updated.price_primary).toBe('220');
    expect(updated.price_secondary).toBe('330');
    await managerPage.locator('#manager-refresh').click();
    await expectJournalStatus(priceRow,'Завершена');

    // Cancelling an incomplete inquiry must not save it or prevent further editing.
    await openOtherInquiry(managerPage);
    await managerPage.locator('#manager-message-dialog').getByRole('button',{name:'Отмена'}).click();
    await openOtherInquiry(managerPage);
    await managerPage.locator('#manager-message-subject').fill('Черновик без текста');
    await managerPage.locator('#manager-message-dialog').getByRole('button',{name:'Закрыть'}).click();
    await openOtherInquiry(managerPage);
    await expect(managerPage.locator('#manager-message-subject')).toHaveValue('');
    await managerPage.locator('#manager-message-subject').fill('Вопрос по точке '+stamp);
    await managerPage.locator('#manager-message-location').selectOption(String(locationId));
    await managerPage.locator('#manager-message-body').fill('Проверьте оборудование на точке.');
    const inquiryPosted=managerPage.waitForResponse((response)=>
      response.url().endsWith('/api/manager/proposals/message') && response.request().method()==='POST'
    );
    await managerPage.locator('#manager-message-submit').click();
    const postedInquiry=await inquiryPosted;
    expect(postedInquiry.status()).toBe(201);
    const inquiryId=(await postedInquiry.json()).id;
    const inquiryRow=managerPage.locator('.request-journal-row[aria-label^="Заявка №'+inquiryId+'."]');
    await expectJournalStatus(inquiryRow,'На рассмотрении');

    await adminPage.locator('#refresh-catalog-approvals').click();
    const incomingInquiry=adminPage.locator('.request-journal-row[aria-label^="Заявка №'+inquiryId+'."]');
    await expect(incomingInquiry).toBeVisible();
    await incomingInquiry.click();
    await expect(adminDialog).toContainText('Проверьте оборудование на точке.');
    await expect(adminDialog.getByRole('button',{name:'Завершить',exact:true})).toBeDisabled();
    await adminDialog.getByLabel('Ответ менеджеру').fill('Оборудование проверено, вопрос решён.');
    await expect(adminDialog.getByRole('button',{name:'Завершить',exact:true})).toBeEnabled();
    await adminDialog.getByRole('button',{name:'Завершить',exact:true}).click();
    await expect(adminDialog).not.toBeVisible();
    await managerPage.locator('#manager-refresh').click();
    const completedStyle=await expectJournalStatus(inquiryRow,'Завершена');
    expect(completedStyle.size).toBe(pendingStyle.size);
    expect(completedStyle.paddingTop).toBe(pendingStyle.paddingTop);
    expect(completedStyle.paddingBottom).toBe(pendingStyle.paddingBottom);
    await inquiryRow.click();
    await expect(managerDetail).toContainText('Оборудование проверено, вопрос решён.');
    await managerDetail.getByRole('button',{name:'Закрыть'}).click();

    await adminPage.locator('#catalog-approvals-filter').selectOption('history');
    const historyRow=adminPage.locator('.request-journal-row[aria-label^="Заявка №'+inquiryId+'."]');
    await expectJournalStatus(historyRow,'Завершена');
    await historyRow.click();
    await expect(adminDialog).toContainText('Оборудование проверено, вопрос решён.');
    await expect(adminDialog.locator('#catalog-approval-approve')).toBeHidden();
    await adminPage.locator('#catalog-approval-close').click();

    const revoke=await adminPage.request.put('/api/admin/managers/'+username+'/access',{
      data:{all_locations:true,catalog_enabled:false,location_ids:[]}
    });
    expect(revoke.ok()).toBeTruthy();
    expect((await managerPage.request.get('/api/manager/catalog')).status()).toBe(403);
    const oldRequests=await (await managerPage.request.get('/api/manager/proposals')).json();
    expect(oldRequests.some((row)=>row.entity_type==='request')).toBeTruthy();
    expect(oldRequests.some((row)=>row.entity_type==='message')).toBeTruthy();
    expect((await managerPage.request.post('/api/manager/proposals/request',{
      data:{request_type:'price_change',items:[{product_id:productId,value:'250'}]}
    })).status()).toBe(403);
    const allowed=await managerPage.request.post('/api/manager/proposals/message',{
      data:{title:'Обращение без каталога',description:'Текстовое обращение независимо от каталога.'}
    });
    expect(allowed.status()).toBe(201);
    await managerPage.reload();
    await openTab(managerPage,'manager-requests');
    await expect(managerPage.locator('.request-journal-row',{hasText:'Обращение без каталога'})).toBeVisible();
    await expect(managerPage.locator('.request-journal-row',{hasText:'Изменить цену'})).toBeVisible();
    await expect(managerPage.locator('[aria-labelledby="manager-catalog-title"]')).toBeHidden();
    await expect(managerPage.locator('.app-header-nav-link[data-header-section="manager-catalog"]')).toBeHidden();
    // A manager can still open the unrestricted sixth preset from this tab.
    await openOtherInquiry(managerPage);
    await managerPage.locator('#manager-message-dialog').getByRole('button',{name:'Отмена'}).click();
  } finally {
    if (locationId) await adminPage.request.delete('/api/locations/'+locationId).catch(()=>undefined);
    if (productId) await adminPage.request.delete('/api/catalog/products/'+productId).catch(()=>undefined);
    await adminPage.request.delete('/api/admin/managers/'+username).catch(()=>undefined);
    await managerContext.close();
    await adminContext.close();
  }
});
