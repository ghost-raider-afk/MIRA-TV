import { test, expect } from '@playwright/test';

const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!';

async function login(page, username, password, redirect) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill(username);
  await page.getByLabel('Пароль').fill(password);
  await Promise.all([page.waitForURL(redirect), page.getByRole('button', { name:/войти/i }).click()]);
}

test('administrator can name a manager and greeting appears only once after login', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const username = 'greet-' + Date.now();
  try {
    await login(page, 'admin', adminPassword, '/');
    await expect(page.locator('.login-greeting')).toBeVisible();
    await page.reload();
    await expect(page.locator('.login-greeting')).toHaveCount(0);
    await page.goto('/settings');
    await expect(page.locator('#manager-create-form')).toHaveAttribute('data-hydrated','true');
    await page.locator('#manager-create-username').fill(username);
    await page.locator('#manager-create-name').fill('Марина');
    await page.locator('#manager-create-password').fill('Manager-Create1!');
    await page.locator('#manager-create-submit').click();
    const card = page.locator('[data-manager-username="' + username + '"]');
    await expect(card.locator('.manager-user-identity strong')).toHaveText('Марина');
    await card.getByRole('textbox', { name:'Имя пользователя ' + username }).fill('Анастасия');
    await card.getByRole('button', { name:'Сохранить имя' }).click();
    await expect(card.locator('.manager-user-identity strong')).toHaveText('Анастасия');
    const managerContext = await browser.newContext();
    try {
      const managerPage = await managerContext.newPage();
      await login(managerPage, username, 'Manager-Create1!', '/manager');
      await expect(managerPage.locator('[data-manager-user]')).toHaveText('Анастасия');
      await expect(managerPage.locator('.login-greeting')).toContainText('Анастасия!');
      await managerPage.reload();
      await expect(managerPage.locator('.login-greeting')).toHaveCount(0);
    } finally { await managerContext.close(); }
  } finally {
    await page.request.delete('/api/admin/managers/' + username).catch(() => {});
    await context.close();
  }
});
