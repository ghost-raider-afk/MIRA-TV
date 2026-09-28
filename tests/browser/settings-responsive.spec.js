import { test, expect } from '@playwright/test';

async function login(page){
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([page.waitForURL((url)=>url.pathname==='/'),page.getByRole('button',{name:/войти/i}).click()]);
}

test('Settings groups site controls and stays overflow-free from desktop to phone',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await login(page);
  await page.goto('/settings');
  await expect(page.locator('.settings-section')).toHaveCount(3);
  await expect(page.locator('#site-ui-scale')).toBeVisible();
  await expect(page.locator('#site-settings-submit')).toBeVisible();

  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  await expect(page.locator('#site-ui-scale')).toBeVisible();

  await page.goto('/profile');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
});

test('Event journal groups entries by day while preserving severity/category filters',async({page})=>{
  await login(page);
  const marker=`grouped-${Date.now()}`;
  const response=await page.request.post('/api/notifications/events',{data:{message:marker,severity:'warning',category:'system'}});
  expect(response.ok()).toBeTruthy();
  await page.goto('/events');
  await page.locator('#event-filter-query').fill(marker);
  const entry=page.locator('.event-journal-entry').filter({hasText:marker});
  await expect(entry).toBeVisible();
  await expect(entry.locator('.event-severity')).toHaveText('Предупреждение');
  await expect(page.locator('.event-journal-day')).toHaveCount(1);
});
