import { test, expect } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';
const adminPassword = process.env.E2E_ADMIN_PASSWORD || '';

test.skip(!adminPassword, 'E2E_ADMIN_PASSWORD is required for the manager workflow test');

async function login(page, username, password, expectedPath) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill(username);
  await page.getByLabel('Пароль').fill(password);
  await Promise.all([
    page.waitForURL((url) => url.pathname === expectedPath),
    page.getByRole('button', { name:/войти/i }).click()
  ]);
}

test('manager canonical preview and catalog proposal approval workflow', async ({ browser }) => {
  const adminContext = await browser.newContext({ baseURL });
  const managerContext = await browser.newContext({ baseURL });
  const adminPage = await adminContext.newPage();
  const managerPage = await managerContext.newPage();
  const stamp = Date.now();
  const managerUsername = `manager_${stamp}`;
  const managerPassword = `Manager-${stamp}-Aa1!`;
  let locationId = null;
  let productId = null;

  try {
    await login(adminPage, 'admin', adminPassword, '/');

    const managerResponse = await adminPage.request.post('/api/admin/managers', {
      data:{ username:managerUsername, password:managerPassword }
    });
    expect(managerResponse.status()).toBe(201);

    const productResponse = await adminPage.request.post('/api/catalog/products', {
      data:{
        name:`Менеджер E2E ${stamp}`,
        producer:'Тестовый завод',
        address:'',
        characteristics:'светлое',
        strength:'4,5%',
        price_primary:'200',
        alcoholic:true,
        beverage_color:'light',
        filtration:'filtered',
        active:true
      }
    });
    expect(productResponse.status()).toBe(201);
    const product = await productResponse.json();
    productId = product.id;

    const locationResponse = await adminPage.request.post('/api/locations', {
      data:{ name:`Manager E2E ${stamp}`, address:'', active:true }
    });
    expect(locationResponse.status()).toBe(201);
    const location = await locationResponse.json();
    locationId = location.id;

    const screenResponse = await adminPage.request.post(`/api/locations/${locationId}/screens`, { data:{} });
    expect(screenResponse.status()).toBe(201);
    const screen = await screenResponse.json();

    const accessResponse=await adminPage.request.put(`/api/admin/managers/${managerUsername}/access`,{
      data:{ all_locations:true,catalog_enabled:true,location_ids:[] }
    });
    expect(accessResponse.ok()).toBeTruthy();
    await login(managerPage, managerUsername, managerPassword, '/manager');

    const group=managerPage.locator('.manager-location').filter({ hasText:location.name });
    await group.locator('.manager-location-toggle').click();
    const screenCard = managerPage.locator(`[data-manager-screen-id="${screen.id}"]`);
    await expect(screenCard).toBeVisible();
    await expect(screenCard.locator('.manager-screen-stage svg.menu-table-svg')).toHaveCount(1, { timeout:5000 });
    await expect(managerPage.locator('.manager-screen-stage img')).toHaveCount(0);

    const productRow = managerPage.locator('.manager-catalog-row', { hasText:`Менеджер E2E ${stamp}` });
    await expect(productRow).toBeVisible();
    const search = managerPage.getByRole('searchbox', { name:'Поиск по названию или производителю' });
    await search.fill('тестовый завод');
    await expect(productRow).toBeVisible();
    await productRow.getByRole('button', { name:'Изменить' }).click();
    const proposalDialog = managerPage.locator('#manager-proposal-dialog');
    await expect(proposalDialog).toBeVisible();
    await proposalDialog.getByLabel('Цена за 1 л').fill('220');
    await proposalDialog.getByRole('button', { name:'Отправить на согласование' }).click();
    await expect(proposalDialog).not.toBeVisible();

    const managerProposal = managerPage.locator('.manager-proposal-card', { hasText:`Менеджер E2E ${stamp}` });
    await expect(managerProposal).toContainText('Ожидает согласования');
    await expect(managerProposal).toContainText('200');
    await expect(managerProposal).toContainText('220');

    await adminPage.goto('/catalog');
    const approval = adminPage.locator('.catalog-approval-card', { hasText:`Менеджер E2E ${stamp}` });
    await expect(approval).toBeVisible();
    await approval.getByRole('button', { name:'Рассмотреть' }).click();
    const approvalDialog = adminPage.locator('#catalog-approval-dialog');
    await expect(approvalDialog).toBeVisible();
    await expect(approvalDialog).toContainText('200');
    await expect(approvalDialog).toContainText('220');
    await approvalDialog.getByLabel('Комментарий менеджеру').fill('Цена подтверждена');
    await approvalDialog.getByRole('button', { name:'Принять изменение' }).click();
    await expect(approvalDialog).not.toBeVisible();

    const updatedResponse = await adminPage.request.get('/api/catalog/products');
    expect(updatedResponse.ok()).toBeTruthy();
    const updatedProducts = await updatedResponse.json();
    const updated = updatedProducts.find((item) => Number(item.id) === Number(productId));
    expect(updated.price_primary).toBe('220');
    expect(updated.price_secondary).toBe('330');

    await managerPage.getByRole('button', { name:'Обновить' }).click();
    await expect(managerProposal).toContainText('Принято');
    await expect(managerProposal).toContainText('Цена подтверждена');

    await managerPage.locator('#manager-new-message').click();
    await managerPage.locator('#manager-message-subject').fill(`Вопрос по точке ${stamp}`);
    await managerPage.locator('#manager-message-location').selectOption(String(locationId));
    await managerPage.locator('#manager-message-body').fill('Проверьте оборудование на точке.');
    await managerPage.locator('#manager-message-submit').click();
    const card=managerPage.locator('.manager-proposal-card', { hasText:`Вопрос по точке ${stamp}` });
    await expect(card).toContainText('Ожидает ответа');

    await adminPage.locator('#refresh-catalog-approvals').click();
    const incoming=adminPage.locator('.catalog-approval-card', { hasText:`Вопрос по точке ${stamp}` });
    await expect(incoming).toBeVisible();
    await incoming.getByRole('button', { name:'Рассмотреть' }).click();
    await expect(approvalDialog).toContainText('Проверьте оборудование на точке.');
    await approvalDialog.getByRole('button', { name:'Отметить обработанным' }).click();
    await expect(approvalDialog).not.toBeVisible();
    await managerPage.getByRole('button', { name:'Обновить' }).click();
    await expect(card).toContainText('Обработано');
    await expect(card).toContainText('№');

    const revoke=await adminPage.request.put(`/api/admin/managers/${managerUsername}/access`, {
      data:{ all_locations:true, catalog_enabled:false, location_ids:[] }
    });
    expect(revoke.ok()).toBeTruthy();
    expect((await managerPage.request.get('/api/manager/catalog')).status()).toBe(403);
    const restrictedProposals=await managerPage.request.get('/api/manager/proposals');
    expect(restrictedProposals.ok()).toBeTruthy();
    const restrictedRows=await restrictedProposals.json();
    expect(restrictedRows.length).toBeGreaterThanOrEqual(1);
    expect(restrictedRows.every((proposal) => proposal.entity_type === 'message')).toBeTruthy();
    expect((await managerPage.request.post('/api/manager/proposals', {
      data:{ entity_type:'product', entity_id:productId, proposed:{} }
    })).status()).toBe(403);
    const messageAllowed=await managerPage.request.post('/api/manager/proposals/message', {
      data:{ title:'Обращение без каталога', description:'Текстовое обращение независимо от каталога.' }
    });
    expect(messageAllowed.status()).toBe(201);
    await managerPage.reload();
    await expect(managerPage.locator('#manager-catalog-list')).toBeHidden();
    await expect(managerPage.locator('.manager-proposal-card', { hasText:'Обращение без каталога' })).toBeVisible();
    await expect(managerPage.locator('.manager-proposal-card', { hasText:`Менеджер E2E ${stamp}` })).toHaveCount(0);
  } finally {
    if (locationId) await adminPage.request.delete(`/api/locations/${locationId}`).catch(() => undefined);
    if (productId) await adminPage.request.delete(`/api/catalog/products/${productId}`).catch(() => undefined);
    await adminPage.request.delete(`/api/admin/managers/${managerUsername}`).catch(() => undefined);
    await managerContext.close();
    await adminContext.close();
  }
});
