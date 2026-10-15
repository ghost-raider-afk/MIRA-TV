import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name:/войти/i }).click()
  ]);
}

async function createScreen(page) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const locationResponse = await page.request.post('/api/locations', {
    data:{ name:`UI guard ${stamp}`, address:'Responsive regression' }
  });
  expect(locationResponse.status()).toBe(201);
  const location = await locationResponse.json();

  const screenResponse = await page.request.post(`/api/locations/${location.id}/screens`, { data:{} });
  expect(screenResponse.status()).toBe(201);
  return screenResponse.json();
}

async function expectNoPageOverflow(page) {
  const overflow = await page.evaluate(() => ({
    client:document.documentElement.clientWidth,
    scroll:document.documentElement.scrollWidth
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
}

async function expectInsideViewport(locator, viewport) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

for (const viewport of [
  { width:1440, height:900, name:'desktop' },
  { width:1024, height:768, name:'laptop' },
  { width:390, height:844, name:'mobile' }
]) {
  test(`critical admin pages do not create page-level horizontal overflow on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await login(page);
    const screen = await createScreen(page);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));

    for (const route of ['/', '/screens', '/locations', '/settings', `/scene?screen=${screen.id}`]) {
      await page.goto(route);
      await page.locator('body').waitFor({ state:'visible' });
      await expectNoPageOverflow(page);
    }

    expect(pageErrors).toEqual([]);
  });
}

test('Scene Editor and table editor stay inside the mobile viewport without clipping', async ({ page }) => {
  const viewport = { width:390, height:844 };
  await page.setViewportSize(viewport);
  await login(page);
  const screen = await createScreen(page);
  await page.goto(`/scene?screen=${screen.id}`);

  await expectNoPageOverflow(page);
  await expectInsideViewport(page.locator('.scene-editor-commandbar'), viewport);
  await expectInsideViewport(page.locator('#scene-editor-stage-shell'), viewport);

  await page.getByRole('button', { name:/Слои/ }).click();
  await expect(page.locator('.scene-editor-layers-panel')).toBeVisible();
  await page.locator('#scene-editor-table-layer').click();
  await page.getByRole('button', { name:'Редактировать содержимое', exact:true }).click();
  const dialog = page.locator('.scene-table-editor-dialog');
  await expectInsideViewport(dialog, viewport);
  await expectNoPageOverflow(page);

  await expect(dialog.getByRole('button', { name:'Читаемый · 2 колонки' })).toBeVisible();
  await expect(dialog.getByRole('button', { name:'Классический' })).toBeVisible();
  await expect(dialog.getByRole('button', { name:'+ Раздел' })).toBeVisible();
  await expect(dialog.getByRole('button', { name:'+ Продукт' })).toBeVisible();
  await expect(dialog.getByRole('button', { name:'+ Тара' })).toBeVisible();
});
