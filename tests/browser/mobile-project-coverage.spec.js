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

async function noOverflow(page, route, width) {
  const geometry = await page.evaluate(() => ({
    viewport:document.documentElement.clientWidth,
    html:document.documentElement.scrollWidth,
    body:document.body.scrollWidth
  }));
  expect(geometry.html, route + ' overflows at ' + width).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.body, route + ' body overflows at ' + width).toBeLessThanOrEqual(geometry.viewport + 1);
}

for (const width of [320,360,430,768]) {
  test('administrator routes fit the viewport at ' + width + 'px', async ({ page }) => {
    test.setTimeout(100_000);
    await page.setViewportSize({ width, height:844 });
    await login(page);
    const routes = [
      '/', '/screens', '/locations', '/catalog', '/settings',
      '/events', '/connect-tv', '/profile', '/scene', '/screen-editor'
    ];
    const errors = [];
    page.on('pageerror', error => errors.push(String(error.message || error)));
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('.app-header')).toBeVisible();
      await noOverflow(page, route, width);
    }
    expect(errors).toEqual([]);
  });
}

test('catalog dialogs and user controls remain usable at phone width', async ({ page }) => {
  await page.setViewportSize({ width:320, height:700 });
  await login(page);
  await page.goto('/catalog');
  await page.locator('#new-product').click();
  const product = page.locator('#product-dialog');
  await expect(product).toBeVisible();
  await expect(product.getByLabel('Название')).toBeVisible();
  await noOverflow(page, 'product dialog', 320);
  await page.locator('#cancel-product-edit').click();
  await page.locator('#new-packaging').click();
  const packaging = page.locator('#packaging-dialog');
  await expect(packaging).toBeVisible();
  await expect(packaging.getByLabel('Название тары')).toBeVisible();
  await noOverflow(page, 'packaging dialog', 320);
  await page.locator('#cancel-packaging-edit').click();
  await page.goto('/settings');
  await expect(page.locator('#manager-create-form')).toBeVisible();
  await expect(page.locator('#manager-create-submit')).toBeEnabled();
  await noOverflow(page, 'manager creation', 320);
});
