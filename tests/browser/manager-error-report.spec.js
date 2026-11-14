import { test, expect } from '@playwright/test';

const baseURL=process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';
const adminPassword=process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!';

async function login(page,username,password,target) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill(username);
  await page.getByLabel('Пароль').fill(password);
  await Promise.all([
    page.waitForURL((url)=>url.pathname===target),
    page.getByRole('button',{name:/войти/i}).click()
  ]);
}

test('manager reports CRM errors with one click; administrator receives an ordinary request notification and full diagnostics', async ({browser}) => {
  const adminContext=await browser.newContext({baseURL});
  const managerContext=await browser.newContext({baseURL});
  const admin=await adminContext.newPage();
  const manager=await managerContext.newPage();
  const stamp=Date.now();
  const username='error_manager_'+stamp;
  const password='Manager-Report1!';
  let productId=null;
  let reportId=null;
  try {
    await login(admin,'admin',adminPassword,'/');
    expect((await admin.request.post('/api/admin/managers',{data:{username,password}})).status()).toBe(201);
    const product=await admin.request.post('/api/catalog/products',{data:{
      name:'Report test '+stamp,producer:'Test producer',address:'',
      characteristics:'',strength:'4.5%',price_primary:'200',
      alcoholic:true,beverage_color:'light',filtration:'filtered',active:true
    }});
    expect(product.status()).toBe(201);
    productId=(await product.json()).id;
    expect((await admin.request.put('/api/admin/managers/'+username+'/access',{
      data:{all_locations:true,catalog_enabled:true,location_ids:[]}
    })).ok()).toBeTruthy();

    await login(manager,username,password,'/manager');
    await manager.locator('#manager-create-request').click();
    const form=manager.locator('#manager-crm-dialog');
    await expect(form).toBeVisible();
    await form.locator('[name="product_id"]').selectOption(String(productId));
    await form.locator('[name="value"]').fill('230');
    await manager.route('**/api/manager/proposals/request',(route)=>route.fulfill({
      status:400,contentType:'application/json',
      body:JSON.stringify({error:'Некорректное значение: Товар'})
    }));
    await form.locator('#crm-submit').click();
    await expect(form.locator('#crm-create-error')).toContainText('Некорректное значение: Товар');
    const send=form.getByRole('button',{name:'Сообщить об ошибке'});
    await expect(send).toBeVisible();
    // The first delivery fails: never show false success; allow a single-click retry.
    let first=true;
    await manager.route('**/api/manager/proposals/error-report',async(route)=>{
      if (first) {
        first=false;
        await route.fulfill({status:503,contentType:'application/json',body:'{"error":"offline"}'});
      } else await route.continue();
    });
    await send.click();
    await expect(form.getByRole('button',{name:'Повторить отправку'})).toBeEnabled();
    await expect(form.locator('.manager-error-report-status')).toContainText('Повторите отправку');
    const completed=manager.waitForResponse((r)=>r.url().endsWith('/api/manager/proposals/error-report') && r.status()===201);
    await form.getByRole('button',{name:'Повторить отправку'}).click();
    const reported=await completed;
    reportId=(await reported.json()).id;
    expect(reportId).toBeGreaterThan(0);
    const submitted=reported.request().postDataJSON();
    expect(submitted.positions[0].product_id).toBe(String(productId));
    expect(submitted.positions[0].new_value).toBe('230');
    expect(submitted.request).toMatchObject({method:'POST',path:'/api/manager/proposals/request',status:400});
    await expect(form.getByRole('button',{name:'Отчёт отправлен'})).toBeDisabled();
    await expect(form.locator('.manager-error-report-status')).toContainText('№'+reportId);

    const notifications=await admin.request.get('/api/request-notifications?limit=30');
    expect(notifications.ok()).toBeTruthy();
    expect((await notifications.json()).items.some(x=>Number(x.proposal_id)===Number(reportId))).toBeTruthy();

    const reportHistory=await admin.request.get('/api/admin/managers/proposals/'+reportId+'/history');
    expect(reportHistory.status()).toBe(200);
    const entry=(await reportHistory.json()).find(x=>x.action==='error_report');
    expect(entry.details.positions[0].product_id).toBe(Number(productId));
    expect(entry.details.request).toMatchObject({method:'POST',path:'/api/manager/proposals/request',status:400});
    expect(entry.details.user_agent).toContain('Mozilla');
    expect(JSON.stringify(entry.details)).not.toContain('password');

    await admin.goto('/approvals');
    const row=admin.locator('.request-journal-row[aria-label^="Заявка №'+reportId+'."]');
    await expect(row).toBeVisible();
    await row.click();
    const card=admin.locator('#catalog-approval-dialog');
    await expect(card).toContainText('Сообщение об ошибке менеджера');
    await expect(card).toContainText('Некорректное значение: Товар');
    const tech=card.getByText('Техническая информация');
    await expect(tech).toBeVisible();
    await tech.click();
    await expect(card.locator('pre')).toContainText('price_primary');

    // All non-modal manager errors use the same reporting action.
    await form.getByRole('button',{name:'Отмена'}).click();
    await manager.evaluate(async()=>{
      const {showToast}=await import('/js/core/toasts.js');
      showToast('Ошибка в рабочем месте менеджера',{severity:'error',persist:false});
    });
    await expect(manager.locator('.toast-region .manager-error-report-button')).toBeVisible();

    const forbidden=await admin.request.post('/api/manager/proposals/error-report',{data:{message:'not a manager'}});
    expect(forbidden.status()).toBe(403);
  } finally {
    if(reportId) await admin.request.delete('/api/admin/managers/proposals/'+reportId).catch(()=>undefined);
    if(productId) await admin.request.delete('/api/catalog/products/'+productId).catch(()=>undefined);
    await admin.request.delete('/api/admin/managers/'+username).catch(()=>undefined);
    await managerContext.close();
    await adminContext.close();
  }
});
