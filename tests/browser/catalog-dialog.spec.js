import { test, expect } from '@playwright/test';

async function login(page){
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([page.waitForURL((url)=>url.pathname==='/'),page.getByRole('button',{name:/войти/i}).click()]);
}

test('Catalog is list-first and opens create/edit forms on demand', async ({page})=>{
  await page.setViewportSize({width:1366,height:768});
  await login(page);
  await page.goto('/catalog');
  await expect(page.locator('.main-content')).toHaveAttribute('data-route-state','ready');

  const productDialog=page.locator('#product-dialog');
  const packagingDialog=page.locator('#packaging-dialog');
  await expect(productDialog).not.toBeVisible();
  await expect(packagingDialog).not.toBeVisible();
  await expect(page.locator('[data-products-list]')).toBeVisible();
  await expect(page.locator('[data-packaging-list]')).toBeVisible();

  await page.locator('#new-product').click();
  await expect(productDialog).toBeVisible();
  await expect(page.locator('#product-name')).toBeFocused();
  await page.locator('#cancel-product-edit').click();
  await expect(productDialog).not.toBeVisible();

  await page.locator('#new-packaging').click();
  await expect(packagingDialog).toBeVisible();
  await page.locator('#cancel-packaging-edit').click();
  await expect(packagingDialog).not.toBeVisible();

  await page.setViewportSize({width:390,height:844});
  await page.locator('#new-product').click();
  const box=await productDialog.boundingBox();
  expect(box?.width).toBeLessThanOrEqual(383);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
});
