import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name: /войти/i }).click()
  ]);
}

test('desktop header submenu stays open while pointer crosses its visual gap', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  const group = page.locator('.app-header-nav-item[data-header-nav-group="monitors"]');
  const dropdown = group.locator('.app-header-dropdown');
  const target = group.getByRole('menuitem', { name: 'Торговые точки' });

  await group.hover();
  await expect(dropdown).toBeVisible();

  const groupBox = await group.boundingBox();
  const dropdownBox = await dropdown.boundingBox();
  const targetBox = await target.boundingBox();
  expect(groupBox).not.toBeNull();
  expect(dropdownBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  expect(dropdownBox.y).toBeGreaterThan(groupBox.y + groupBox.height);

  const gapX = dropdownBox.x + (dropdownBox.width / 2);
  const gapY = (groupBox.y + groupBox.height + dropdownBox.y) / 2;
  await page.mouse.move(gapX, gapY);
  await expect(dropdown).toBeVisible();

  await page.mouse.move(targetBox.x + (targetBox.width / 2), targetBox.y + (targetBox.height / 2));
  await page.mouse.down();
  await page.mouse.up();

  await expect(page).toHaveURL(/\/locations$/);
  await expect(page.locator('#location-form')).toBeVisible();
});
