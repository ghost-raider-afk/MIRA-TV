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

test('Overview dashboard is reached from the logo and switches reporting periods', async ({ page }) => {
  await login(page);

  await expect(page.locator('.dashboard-commandbar')).toBeVisible();
  await expect(page.locator('[data-dashboard-card]')).toHaveCount(4);
  await expect(page.locator('.ui-context-body .app-route-link', { hasText:'Обзор' })).toHaveCount(0);
  await expect(page.locator('.ui-rail-button[aria-label="Обзор"]')).toHaveCount(0);

  const requestedRanges = [];
  page.on('request', (request) => {
    if (!request.url().includes('/api/overview')) return;
    const url = new URL(request.url());
    requestedRanges.push(url.searchParams.get('range'));
  });

  for (const range of ['24h','7d','30d','1h']) {
    await page.locator(`[data-dashboard-range="${range}"]`).click();
    await expect(page.locator(`[data-dashboard-range="${range}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => requestedRanges.includes(range)).toBe(true);
  }

  await page.locator('.ui-rail-button[aria-label="TV-сеть"]').click();
  await expect(page).toHaveURL(/\/screens$/);
  await page.locator('.ui-rail-brand').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.dashboard-commandbar')).toBeVisible();
});
