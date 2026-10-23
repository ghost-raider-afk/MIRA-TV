import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL(url=>url.pathname==='/'),
    page.getByRole('button',{name:/войти/i}).click()
  ]);
}

test('event journal never exposes legacy English CRM actions and keeps Russian details',async({page})=>{
  await login(page);
  await page.route('**/api/notifications/events?*',async(route)=>{
    const now=new Date().toISOString();
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      items:[
        {id:1,created_at:now,severity:'success',category:'catalog',actor_username:'supermanager',
          action:'crm.request.complete',message:'Обработка заявки №6: complete.',details:''},
        {id:2,created_at:now,severity:'success',category:'catalog',actor_username:'supermanager',
          action:'crm.request.review',message:'Обработка заявки №5: review.',details:''},
        {id:3,created_at:now,severity:'success',category:'catalog',actor_username:'supermanager',
          action:'crm.request.review',
          message:'Администратор рассмотрел заявку №7 «Убрать позиции из меню»: согласовано — 1, на доработку — 0, отклонено — 0.',
          details:'Товар: НЕМЕЦКОЕ (Барнаульский завод) · Торговая точка: Центральный магазин · Решение: Согласовано'}
      ],stats:{total:3,errors:0,warnings:0},retention_days:30,max_entries:5000
    })});
  });
  await page.goto('/events');
  const entries=page.locator('.event-journal-entry');
  await expect(entries).toHaveCount(3);
  await expect(entries.nth(0)).toContainText('Заявка №6 закрыта вручную администратором.');
  await expect(entries.nth(1)).toContainText('Администратор рассмотрел заявку №5.');
  await expect(entries.nth(2)).toContainText('Торговая точка:');
  await entries.nth(2).locator('summary').click();
  await expect(entries.nth(2)).toContainText('Центральный магазин');
  for(const entry of await entries.all()) {
    await expect(entry).not.toContainText('crm.request');
    await expect(entry).not.toContainText('complete.');
    await expect(entry).not.toContainText('review.');
  }
});
